import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import emojis from './clean_emojis.json';

function EmojiCooccurrence() {

  const svgElement = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = d3.select(svgElement.current);

    svg.attr('viewPort', [0, 0, 100, 100]);
    svg.attr('width', 600);
    svg.attr('height', 600);

    const emojisG = svg.append('g');
    console.log(emojis);
    // @ts-ignore
    emojisG.data(emojis);
    emojisG.enter()
        .append('svg:circle')
        .attr('r', (d: any) => d[d['emoji']]);

  }, []);

  return (
    <main>
      <div>
        <svg ref={svgElement} />
      </div>
    </main>
  );
}

export default EmojiCooccurrence;
