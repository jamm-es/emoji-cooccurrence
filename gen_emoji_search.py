import json
from emoji import demojize
import pandas as pd

with open('emojis.json', 'r') as f:
    emojis = json.load(f)

    common = pd.Series([emojis[x][x] for x in emojis], index=[x for x in emojis])
    common = common.sort_values(ascending=False)
    common = common.head(1000)

    output = []
    for emoji in common.index:
        name = demojize(emoji, delimiters=('', '')).replace('_', ' ')
        search_obj = {'emoji': emoji, 'name': name, 'freq': emojis[emoji][emoji]}
        output.append(search_obj)

    with open('emoji_search.json', 'w') as g:
        json.dump(output, g)