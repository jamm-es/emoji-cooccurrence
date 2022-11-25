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
  freq: number,
  url: string
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
  const [showToolTip, setShowToolTip] = useState<boolean>(false);

  // @ts-ignore
  const baseEmojiData: Emoji[] = useMemo(() => cleanEmojiData.map((d: any) => ({ ...d, x: NaN, y: NaN, s: 0 })), []);

  const fuse = useMemo(() => new Fuse(searchData, { keys: ['emoji', 'name'] }), []);
  // const forceRadial = useMemo(() => d3.forceRadial(0).strength(0), []);
  const forceLink = useMemo(() => d3.forceLink()
      .id((d: any) => d.emoji)
      .strength(0.01)
    , []);
  const simulation = useMemo(() => d3.forceSimulation([] as Emoji[])
    .force('collide', d3.forceCollide(d => d.s/2))
    .force('link', forceLink)
    //.force('radial', forceRadial)
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
      .attr('viewBox', [-viewboxRadius, -viewboxRadius, 2*viewboxRadius, 2*viewboxRadius]);
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

    const centeredEmoji = filteredData.find(d => d.emoji === emojiFilter);

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
    if(centeredEmoji !== undefined) {
      const nonCenteredEmojis = filteredData
        .filter(d => d.emoji !== emojiFilter);
      const links = nonCenteredEmojis.map(d => ({ source: centeredEmoji, target: d }));
      forceLink.links(links);
      forceLink.distance((l, i) => {
        return centeredEmoji.s/2+(l.target as Emoji).s/2*Math.sqrt(0.5+i);
      });
      // forceRadial.radius((d: any, i) => {
      //   return centeredEmoji.s/2+d.s/2*Math.sqrt(0.5+i);
      // });
    }

    // cool off link strength
    const coolOffTime = 3000;
    const t = d3.timer(elapsed => {
      if(elapsed > coolOffTime) {
        t.stop();
        forceLink.strength(0);
        // forceRadial.strength(0);
      }
      else {
        forceLink.strength(0.3*(coolOffTime-elapsed)/coolOffTime);
        // forceRadial.strength(0.3*(coolOffTime-elapsed)/coolOffTime);
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

          g.append('svg:circle')
            .attr('opacity', 0)
            .attr('r', 0)
            .on('click', (_, d) => setEmojiFilter(d.emoji))
            // .on('mouseenter', (_, d) => {
            //   showTooltip(d, centeredEmoji);
            // })
            // .on('mouseleave', (_, d) => {
            //   hideTooltip();
            // })
            .transition()
            .duration(transitionDuration)
            .ease(transitionEase)
            .attr('r', d => d.s/2)

          return g;
        },
        update => {
          update.select('image')
            .transition()
            .duration(transitionDuration)
            .ease(transitionEase)
            .attr('width', d => d.s)
            .attr('height', d => d.s)
            .attr('x', d => -d.s/2)
            .attr('y', d => -d.s/2);

          update.select('circle')
            // .on('mouseenter', (_, d) => {
            //   showTooltip(d, centeredEmoji);
            // })
            .transition()
            .duration(transitionDuration)
            .ease(transitionEase)
            .attr('r', d => d.s/2);

          return update;
        },
        exit => {
          exit.select('image')
            .transition()
            .duration(transitionDuration)
            .ease(transitionEase)
            .attr('width', 0)
            .attr('height', 0)
            .attr('x', 0)
            .attr('y', 0);

          exit.select('circle')
            .transition()
            .duration(transitionDuration)
            .ease(transitionEase)
            .attr('r', 0)

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


  useLayoutEffect(() => {
    const num = 50;
    const top = searchData.sort((a, b) => b.freq - a.freq).filter((_, i) => i < num);
    let num_called = 0;
    console.log(top);
    const t = setInterval(() => {
      if(num_called === num) {
        clearInterval(t);
        return;
      }

      setEmojiFilter(top[num_called].emoji);
      ++num_called;
    }, 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <main className='vh-100' onClick={() => setSearchInputFocused(false)} style={{ backgroundColor: '#111111', width: '800px'}}>
      {/*<div className={`alert alert-dark position-fixed ${tooltipIsVisible ? 'd-flex' : 'd-none'}`} ref={tooltipElement}>*/}
      {/*  <div className='pe-3'>*/}
      {/*    <img src={tooltipImageSrc} />*/}
      {/*  </div>*/}
      {/*  <div>*/}
      {/*    <h6>{tooltipHeader}</h6>*/}
      {/*    {tooltipDetails.map(s => <p>{s}</p>)}*/}
      {/*  </div>*/}
      {/*</div>*/}

      <div className='position-fixed p-3 text-light top-0 start-0 user-select-none' style={{ pointerEvents: 'none' }}>
        <h1>Emoji cooccurrence in online comments</h1>
        <p>basically, "If a comment contains X emoji, what are the chances it also has Y?"</p>
        {/*<p>click on an emoji to center it</p>*/}
        {/*<p>bigger surrounding emojis cooccur more frequently</p>*/}
      </div>

      {/*<div className='position-fixed p-3 text-light top-0 end-0'>*/}
      {/*  <img*/}
      {/*    src='https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/2753.png'*/}
      {/*    style={{ filter: 'grayscale(100%) brightness(2.5)', width: '30px', height: '30px', transition: 'all 0.5s' }}*/}
      {/*    onClick={() => setShowToolTip(true)}*/}
      {/*    id='activate-modal'*/}
      {/*  />*/}
      {/*</div>*/}

      {/*<div className='position-fixed p-3 d-flex flex-column-reverse bottom-0 start-0' style={{ maxWidth: '500px' }}>*/}
      {/*  <input*/}
      {/*    className={`form-control text-light rounded-0 border-secondary shadow-none ${searchInputFocused && autocompleteResults.length !== 0 && 'border-top-0'}`}*/}
      {/*    style={{ backgroundColor: '#292929' }}*/}
      {/*    type='text'*/}
      {/*    value={searchInput}*/}
      {/*    onChange={e => setSearchInput(e.target.value)}*/}
      {/*    onFocus={() => setSearchInputFocused(true)}*/}
      {/*    onClick={e => {*/}
      {/*      e.stopPropagation();*/}
      {/*      setSearchInputFocused(true);*/}
      {/*    }}*/}
      {/*    placeholder='search...'*/}
      {/*    ref={inputElement}*/}
      {/*    id='emoji-cooccurrence-input'*/}
      {/*  />*/}
      {/*  {searchInputFocused && autocompleteResults.length !== 0 && <div*/}
      {/*    className='list-group rounded-0 border-secondary'*/}
      {/*  >*/}
      {/*    {autocompleteResults.map(d => <button*/}
      {/*      className='list-group-item list-group-item-action border-secondary p-2'*/}
      {/*      style={{ backgroundColor: '#292929', color: '#BBBBBB'}}*/}
      {/*      key={d.emoji}*/}
      {/*      onClick={() => {*/}
      {/*        setSearchInput(d.name);*/}
      {/*        setEmojiFilter(d.emoji);*/}
      {/*      }}*/}
      {/*    >*/}
      {/*      <img src={d.url} style={{ width: '30px', height: '30px' }}/> {d.name}*/}
      {/*    </button>)}*/}
      {/*  </div>}*/}
      {/*</div>*/}

      <div className='position-fixed bottom-0 end-0 text-light p-3'>
        <p className='m-0'>by james / jamesli.io</p>
      </div>

      {/*<div*/}
      {/*  className={`${!showToolTip && 'd-none'} position-fixed top-0 start-0 w-100 h-100`}*/}
      {/*  style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}*/}
      {/*  onClick={() => setShowToolTip(false)}*/}
      {/*>*/}
      {/*  <div className='text-light mt-3 mx-auto p-3' style={{ backgroundColor: '#333333', width: 'min(500px, 100%)' }}>*/}
      {/*    <p>*/}
      {/*      Data from every reddit comment since August 2022.*/}
      {/*    </p>*/}
      {/*    <p>*/}
      {/*      Bubbles scale such that the overall volume fits on screen.*/}
      {/*    </p>*/}
      {/*    <p className='mb-0'>*/}
      {/*      Created by James - email me! (<a href='mailto:me@jamm.es' className='text-light'>me@jamm.es</a>)*/}
      {/*    </p>*/}
      {/*  </div>*/}
      {/*</div>*/}

      <div className='position-fixed start-0 bottom-0 w-100 mb-2'>
        <div className='mx-auto text-light'>
          <h2 className='text-center'>
            {
              emojiFilter === undefined ? <>Overall</> : <>Centered on <img className='ps-2 mb-0' style={{ width: '50px'}} src={searchData.find(d => d.emoji === emojiFilter)!.url}/>, {(searchData.find(d => d.emoji === emojiFilter)!.freq/searchData.reduce((acc, cv) => acc+cv.freq, 0)*100).toFixed(2)}% of overall</>
            }
          </h2>
          {
            emojiFilter !== undefined &&  <p className='text-center mb-0'>
              ({searchData.find(d => d.emoji === emojiFilter)!.name})
            </p>
          }

        </div>
      </div>

      <div className='d-flex justify-content-center flex-column align-content-center h-100'>
        <svg ref={svgElement} />
      </div>

    </main>
  );
}

export default EmojiCooccurrence;
