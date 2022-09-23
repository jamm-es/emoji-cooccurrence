import json
from urllib.parse import urljoin
import requests

cdn_url = 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/'


def emoji_to_url(emoji):
    # remove variant selector from single emojis
    if len(emoji) == 2 and emoji[1] == '\ufe0f':
        emoji = emoji[0]
    # remove variant selector from keycap emojis
    elif len(emoji) == 3 and emoji[2] == '\u20e3':
        emoji = emoji[0] + emoji[2]

    hex_list = []
    for char in emoji:
        hex_list.append(hex(ord(char))[2:])
    image_part = '-'.join(hex_list)
    return urljoin(cdn_url, image_part+'.png')


with open('./emojis.json', 'r') as f:
    emojis_data = json.load(f)
    emojis = [x for x in emojis_data]

    output = {}
    errored = []
    for emoji in emojis:
        url = emoji_to_url(emoji)
        r = requests.head(url)
        if r.status_code != 200:
            print(f'{r.status_code} from {url}')
            errored.append(url)
            url = ''
        else:
            print(f'{url} OK')
        output[emoji] = url

    with open('./errored_urls.json', 'w') as g:
        json.dump(errored, g)

    with open('./emoji_urls.json', 'w') as g:
        json.dump(output, g)


