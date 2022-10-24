import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import Fuse from 'fuse.js';
import cleanEmojiData from './clean_emojis.json';
import config from './config.json';
import searchData from './emoji_search.json';
import './emoji-cooccurrence.scss';
import { filter } from "d3";

interface Emoji {
  x: number,
  y: number,
  s: number
  emoji: string,
  url: string,
  data: { [emoji: string]: number },
  fx?: number,
  fy?: number,
  vx?: number,
  vy?: number
}

interface EmojiSearch {
  emoji: string,
  name: string,
  freq: number
}

const transitionDuration = 1000;
const transitionEase = d3.easeCubic;

function EmojiCooccurrence() {
  const svgElement = useRef<SVGSVGElement>(null);
  const inputElement = useRef<HTMLInputElement>(null);

  const [searchInput, setSearchInput] = useState<string>('');
  const [emojiFilter, setEmojiFilter] = useState<string>();
  const [autocompleteResults, setAutocompleteResults] = useState<EmojiSearch[]>([]);
  const [searchInputFocused, setSearchInputFocused] = useState<boolean>(false);

  // @ts-ignore
  const baseEmojiData: Emoji[] = useMemo(() => cleanEmojiData.map((d: any) => ({ ...d, x: NaN, y: NaN, s: 0 })), []);
  const fuse = useMemo(() => new Fuse(searchData, { keys: ['emoji', 'name'] }), []);
  const forceLink = useMemo(() => d3.forceLink()
    .id((d: any) => d.emoji)
      .strength(0.01)
    .distance((l: any) => {
      return 200 / l.target.s*20+l.source.s/2;
    })
  , []);
  const simulation = useMemo(() => d3.forceSimulation([] as Emoji[])
    .force('collide', d3.forceCollide(d => d.s/2))
    .force('link', forceLink)
    .alphaDecay(0)
    .on('tick',() => {
      d3.select(svgElement.current)
        .selectAll('g')
        .attr('transform', (d: any) => {
          return `translate(${d.x}, ${d.y})`;
        });
    }), []);

  // initial setup
  useLayoutEffect(() => {
    // @ts-ignore
    // base array that'll be filtered to remove extraneous emoji bubbles.
    // adds x, y (initial position), s (diameter), url (to emoji image location)

    d3.select(svgElement.current)
      .attr('viewBox', [-750, -750, 1500, 1500])
      .attr('width', 800)
      .attr('height', 800);
  }, []);

  // regenerate/change bubbles upon filter update
  useLayoutEffect(() => {

    // filters emojiData to remove tiny emoji bubbles to improve performance.
    // min/max sizes are set in config.json
    const max = Math.max(...baseEmojiData.map(d => d.data[emojiFilter ?? d.emoji]));
    const filteredData: Emoji[] = baseEmojiData.map(d => {
      d.s = Math.sqrt(d.data[emojiFilter ?? d.emoji] / max) * config.maxSize;
      d.fx = undefined;
      d.fy = undefined;
      return d;
    })
      .filter(d => d.s >= config.minSize);

    // transition selected emoji to be fixed in the center
    const selectedEmoji = filteredData.find(d => d.emoji === emojiFilter)!;
    if(selectedEmoji !== undefined) {
      const interpFX = d3.interpolateNumber(selectedEmoji.x, 0);
      const interpFY = d3.interpolateNumber(selectedEmoji.y, 0)
      const t = d3.timer(elapsed => {
        if(elapsed > transitionDuration) {
          t.stop();
        }
        const normalizedTime = elapsed/transitionDuration;
        selectedEmoji.fx = interpFX(transitionEase(normalizedTime));
        selectedEmoji.fy = interpFY(transitionEase(normalizedTime));
      });
      setTimeout(() => {
        selectedEmoji.fx = 0;
        selectedEmoji.fy = 0;
      }, 1000);
    }

    // set force linkages with selected emoji filter
    if(emojiFilter !== undefined) {
      const links = filteredData.filter(d => d.emoji !== emojiFilter)
        .map(d => ({ source: emojiFilter, target: d.emoji }));
      console.log(links[0]);
      forceLink.links(links);
    }

    // update emoji circles via join with filtered data
    d3.select(svgElement.current)
      .selectAll('g')
      .data(filteredData, (d: any) => d.emoji)
      .join(
        enter => {
          const g = enter.append('svg:g')
            .attr('transform', 'translate(0, 0)');

          g.append('svg:circle')
            .attr('opacity', 0)
            .attr('r', 0)
            //.on('click', (_, d) => setEmojiFilter(d.emoji))
            .transition()
            .duration(transitionDuration)
            .ease(transitionEase)
            .attr('r', d => d.s/2);

          g.append('svg:image')
            .attr('href', d => d.url)
            .attr('width', 0)
            .attr('height', 0)
            .attr('x', 0)
            .attr('y', 0)
            .on('click', (_, d) => setEmojiFilter(d.emoji))
            .transition()
            .duration(transitionDuration)
            .ease(transitionEase)
            .attr('width', d => d.s)
            .attr('height', d => d.s)
            .attr('x', d => -d.s/2)
            .attr('y', d => -d.s/2);

          return g;
        },
        update => {
          update.select('circle')
            .transition()
            .duration(transitionDuration)
            .ease(transitionEase)
            .attr('r', d => d.s/2);

          update.select('image')
            .transition()
            .duration(transitionDuration)
            .ease(transitionEase)
            .attr('width', d => d.s)
            .attr('height', d => d.s)
            .attr('x', d => -d.s/2)
            .attr('y', d => -d.s/2);

          return update;
        },
        exit => {
          exit.select('circle')
            .transition()
            .duration(transitionDuration)
            .ease(transitionEase)
            .attr('r', 0)

          exit.select('image')
            .transition()
            .duration(transitionDuration)
            .ease(transitionEase)
            .attr('width', 0)
            .attr('height', 0)
            .attr('x', 0)
            .attr('y', 0);

          exit.transition()
            .duration(1000)
            .ease(transitionEase)
            .remove();

          return exit;
        }
      );

    simulation.nodes(filteredData);

  }, [emojiFilter]);

  // handles emoji search
  useEffect(() => {
    // use fuse fuzzy search with emoji_search.json data.
    // gets 20 best matches then sorts by frequency
    let searchResult = fuse.search(searchInput, { limit: 20 })
      .map(d => d.item)
      .sort((a, b) => b.freq - a.freq)

    // if the search result exactly matches an emoji name or emoji character, return just that result
    for(const potentialExact of searchResult) {
      if(potentialExact.name.toLowerCase() === searchInput.toLowerCase() || potentialExact.emoji === searchInput) {
        searchResult = [potentialExact];
        break;
      }
    }

    // if we haven't found an exact match, show only the 10 most popular resutls
    if(searchResult.length > 10) {
      searchResult = searchResult.slice(0, 10);
    }

    setAutocompleteResults(searchResult);
  }, [searchInput]);

  return (
    <main onClick={() => setSearchInputFocused(false)} style={{ backgroundColor: '#111111'}}>
      <div className='m-3 mt-0'>
        <input
          className='form-control'
          type='text'
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onFocus={() => setSearchInputFocused(true)}
          onClick={e => {
            e.stopPropagation();
            setSearchInputFocused(true);
          }}
          ref={inputElement}
        />
        {/*
          Autocomplete results are only shown when the search input box is active and there are actual results to show
        */}
        {searchInputFocused && autocompleteResults.length !== 0 && <div className='list-group position-absolute'>
          {autocompleteResults.map(d => <button key={d.emoji} onClick={() => {
            setSearchInput(d.name);
            setEmojiFilter(d.emoji);
          }} className='list-group-item list-group-item-action'>
            {`${d.emoji} - ${d.name} - ${d.freq} - ${baseEmojiData.find(e => e.emoji === d.emoji)!.url}`}
          </button>)}
        </div>}
      </div>
      <div>
        <div className='d-flex justify-content-center'>
          <svg ref={svgElement} />
        </div>
      </div>
    </main>
  );
}

export default EmojiCooccurrence;
