import pandas as pd
import numpy as np
import json

with open('./emojis.json', 'r') as f:
    emojis = json.load(f)

    common = pd.Series([emojis[x][x] for x in emojis], index=[x for x in emojis])
    common = common.sort_values(ascending=False)
    common = common.head(1000)

    emojis = {key: value for (key, value) in emojis.items() if key in common.index}
    for (key, value) in emojis.items():
        emojis[key] = {e: (0 if e not in value else value[e]) for e in common.index}

    output = []
    with open('./emoji-urls.json', 'r') as g:
        emoji_urls = json.load(g)

        for emoji in common.index:
            emoji_obj = {'emoji': emoji, 'url': emoji_urls[emoji], 'data': {}}
            for e in common.index:
                emoji_obj['data'][e] = emojis[e][emoji]
            output.append(emoji_obj)

    with open('src/emoji-cooccurrence/clean_emojis.json', 'w') as g:
        json.dump(output, g)