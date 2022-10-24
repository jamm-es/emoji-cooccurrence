import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import Fuse from 'fuse.js';
import cleanEmojiData from './clean_emojis.json';
import config from './config.json';
import searchData from './emoji_search.json';
import './emoji-cooccurrence.scss';

interface Emoji {
  x: number,
  y: number,
  s: number,
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

const viewboxRadius = 750;
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
    , []);
  const simulation = useMemo(() => d3.forceSimulation([] as Emoji[])
    .force('collide', d3.forceCollide(d => d.s/2))
    .force('link', forceLink)
    .force('center', d3.forceCenter())
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
      .attr('viewBox', [-viewboxRadius, -viewboxRadius, 2*viewboxRadius, 2*viewboxRadius])
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
      .filter(d => d.s >= config.minSize)
      .sort((a, b) => b.s - a.s)
      .filter((_, i) => i < config.maxCount);

    const centeredEmoji = filteredData.find(d => d.emoji === emojiFilter)!;

    // re-scale to maintain estimated overall size
    const estimatedSize = filteredData.reduce((prev, curr) => prev+(curr.s/2)*(curr.s/2)*Math.PI, 0);
    const estimatedRadius = Math.sqrt(estimatedSize/Math.PI)*1.5;
    filteredData.forEach(d => {
      d.s = d.s*viewboxRadius/estimatedRadius;
    });

    // transition selected emoji to be fixed in the center
    if(centeredEmoji !== undefined) {
      const interpFX = d3.interpolateNumber(centeredEmoji.x, 0);
      const interpFY = d3.interpolateNumber(centeredEmoji.y, 0)
      const t = d3.timer(elapsed => {
        if(elapsed > transitionDuration) {
          t.stop();
        }
        const normalizedTime = elapsed/transitionDuration;
        centeredEmoji.fx = interpFX(transitionEase(normalizedTime));
        centeredEmoji.fy = interpFY(transitionEase(normalizedTime));
      });
      setTimeout(() => {
        centeredEmoji.fx = 0;
        centeredEmoji.fy = 0;
      }, 1000);
    }

    // set force linkages with selected emoji filter
    if(emojiFilter !== undefined) {
      const nonCenteredEmojis = filteredData
        .filter(d => d.emoji !== emojiFilter);
      const links = nonCenteredEmojis.map(d => ({ source: centeredEmoji, target: d }));
      forceLink.links(links);
      forceLink.distance((l, i) => {
        return centeredEmoji.s/2+(l.target as Emoji).s/2*Math.sqrt(0.5+i);
      });
    }

    // cool off link strength
    const coolOffTime = 3000;
    const t = d3.timer(elapsed => {
      if(elapsed > coolOffTime) {
        t.stop();
        forceLink.strength(0);
      }
      else {
        forceLink.strength(0.3*(coolOffTime-elapsed)/coolOffTime);
      }
    });

    // update emoji circles via join with filtered data
    d3.select(svgElement.current)
      .selectAll('g')
      .data(filteredData, (d: any) => d.emoji)
      .join(
        enter => {
          const g = enter.append('svg:g')
            .attr('transform', 'translate(0, 0)');

          // make new emojis fly in, if it's not first initialization
          enter.data().forEach(d => {
            if(Number.isFinite(d.x)) { // ensures it's not the first initialization
              const angle = Math.atan2(d.y, d.x);
              const radius = viewboxRadius*Math.SQRT2;
              d.x = Math.cos(angle)*radius;
              d.y = Math.sin(angle)*radius;
            }
          });

          g.append('svg:circle')
            .attr('opacity', 0)
            .attr('r', 0)
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

          // makes emoji fly outwards when transitioning out
          exit.transition()
            .duration(1000)
            .ease(transitionEase)
            .attr('transform', function(d) {
              const angle = Math.atan2(d.y, d.x);
              const radius = viewboxRadius*Math.SQRT2;
              return `translate(${radius*Math.cos(angle)}, ${radius*Math.sin(angle)})`;
            })
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
