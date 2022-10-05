import json
from emoji import distinct_emoji_list
import requests
from datetime import datetime
from dateutil import rrule
from urllib import parse
import io
import zstandard as zstd
import os

# defines month/year range to download
START_YEAR = 2005
START_MONTH = 12
END_YEAR = 2022
END_MONTH = 8


DOWNLOAD_URL = 'https://files.pushshift.io/reddit/comments/'
OUT_DIR = './out/'


def unify_emoji_variant(emoji):
    # remove variant selector from single emojis
    if len(emoji) == 2 and emoji[1] == '\ufe0f':
        emoji = emoji[0]
    # remove variant selector from keycap emojis
    elif len(emoji) == 3 and emoji[2] == '\u20e3':
        emoji = emoji[0] + emoji[2]

    return emoji


# %%
start_date = datetime(START_YEAR, START_MONTH, 1)
end_date = datetime(END_YEAR, END_MONTH, 1)
emojis = {}

# download comments archive for each month
for dt in rrule.rrule(rrule.MONTHLY, dtstart=start_date, until=end_date):

    # check for existing as_of saved files for graceful restart
    emojis_checkpoint_path = os.path.join(OUT_DIR, f'as_of_{dt.year}_{dt.month}.json')
    if os.path.exists(emojis_checkpoint_path):
        print(f'Loading checkpoint from {emojis_checkpoint_path}')
        with open(emojis_checkpoint_path, 'w') as f:
            emojis = json.load(f)
        continue

    # efficiency stream download
    url = parse.urljoin(DOWNLOAD_URL, f'RC_{dt.year}-{str(dt.month).zfill(2)}.zst')
    print(f'Downloading from {url}', flush=True)

    with requests.get(url, stream=True) as r:
        # stream decompression
        dctx = zstd.ZstdDecompressor(max_window_size=2147483648)
        stream_reader = dctx.stream_reader(r.raw)
        decompressed = io.TextIOWrapper(stream_reader, encoding='utf-8')

        # loop through comments in decompressed file
        lines_processed = 0
        start_time = datetime.now()
        for line in decompressed:
            try:
                comment = json.loads(line)
            except Exception as e:
                print(e)
                print(f'Failed json decode on {line}')
                continue
            if 'body' in comment:
                comment_emojis = distinct_emoji_list(comment['body'])
                distinct_emojis = set(unify_emoji_variant(x) for x in comment_emojis)
                for emoji in distinct_emojis:
                    if emoji not in emojis:
                        emojis[emoji] = {}
                    for emoji_counter in distinct_emojis:
                        if emoji_counter not in emojis[emoji]:
                            emojis[emoji][emoji_counter] = 0
                        emojis[emoji][emoji_counter] += 1

            lines_processed += 1
            if lines_processed % 1000000 == 0:
                print(f'{lines_processed} lines processed in {datetime.now()-start_time}', flush=True)

    print(f'Finished year {dt.year}, month {dt.month} in {datetime.now()-start_time}', flush=True)

    # save checkpoint
    with open(emojis_checkpoint_path, 'w') as f:
        json.dump(emojis, f)

with open(os.path.join(OUT_DIR, 'emoji_final.json')) as f:
    json.dump(emojis, f)
