import json
from emoji import distinct_emoji_list

DATA_PATH = './RC_2022-07/RC_2022-07'
OUT_PATH = './NEW_emojis.json'

emojis = {}
lines_processed = 0


def unify_emoji_variant(emoji):
    # remove variant selector from single emojis
    if len(emoji) == 2 and emoji[1] == '\ufe0f':
        emoji = emoji[0]
    # remove variant selector from keycap emojis
    elif len(emoji) == 3 and emoji[2] == '\u20e3':
        emoji = emoji[0] + emoji[2]

    return emoji


with open(DATA_PATH, encoding='utf-8') as f:
    for line in f:
        comment = json.loads(line)
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
        if lines_processed % 10000 == 0:
            print(f'{lines_processed} lines processed')
            break

with open(OUT_PATH, 'w') as f:
    json.dump(emojis, f)