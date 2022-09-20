import numpy as np
import pandas as pd
import os
import json
from emoji import distinct_emoji_list

DATA_PATH = './RC_2022-07/RC_2022-07'
OUT_PATH = './emojis.json'

emojis = {}
lines_processed = 0

with open(DATA_PATH, encoding='utf-8') as f:
    for line in f:
        comment = json.loads(line)
        if 'body' in comment:
            comment_emojis = distinct_emoji_list(comment['body'])
            for emoji in comment_emojis:
                if emoji not in emojis:
                    emojis[emoji] = {}
                for emoji_counter in comment_emojis:
                    if emoji_counter not in emojis[emoji]:
                        emojis[emoji][emoji_counter] = 0
                    emojis[emoji][emoji_counter] += 1
        lines_processed += 1
        if lines_processed % 10000 == 0:
            print(f'{lines_processed} lines processed')

with open(OUT_PATH, 'w') as f:
    json.dump(emojis, f)