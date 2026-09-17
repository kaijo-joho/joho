/* Linear, reversible animation evaluation. No timers and no DOM state. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IlapoAnimation = api;
}(globalThis, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  function progress(item, time) {
    if (time < item.start) return 0;
    return item.end === item.start ? 1 : Math.min(1, (time - item.start) / (item.end - item.start));
  }
  function mix(from, to, amount) {
    if (amount <= 0) return from;
    if (amount >= 1 || from === 'none') return to;
    return '#' + [1, 3, 5].map(i => {
      const a = parseInt(from.slice(i, i + 2), 16), b = parseInt(to.slice(i, i + 2), 16);
      return Math.round(a + (b - a) * amount).toString(16).padStart(2, '0');
    }).join('').toUpperCase();
  }
  function objectColor(object, channel) {
    if (channel === 'fill' && object.type === 'text' && Array.isArray(object.runs)) return object.runs.map(run => run.fill === undefined ? object.style.fill : run.fill);
    return object.style[channel];
  }
  function targetColor(from, to) { return Array.isArray(from) ? from.map(() => to) : to; }
  function mixColor(from, to, amount) { return Array.isArray(from) ? from.map(value => mix(value, to, amount)) : mix(from, to, amount); }
  function compile(page) {
    const groups = [{index: 0, duration: 0, items: []}];
    let group = groups[0], previousStart = 0, previousEnd = 0;
    for (const animation of page.animations || []) {
      if (animation.trigger === 'click') {
        group = {index: groups.length, duration: 0, items: []}; groups.push(group);
        previousStart = previousEnd = 0;
      }
      const start = (animation.trigger === 'with' ? previousStart : animation.trigger === 'after' ? previousEnd : 0) + animation.delay;
      const end = start + animation.duration;
      group.items.push({animation, start, end});
      previousStart = start; previousEnd = end; group.duration = Math.max(group.duration, end);
    }
    // Capture the color at each effect's start. On the same channel, later listed
    // effects take precedence; earlier effects cannot subsequently overwrite them.
    const colors = new Map(page.objects.map(o => [o.id, {fill: objectColor(o, 'fill'), stroke: objectColor(o, 'stroke')} ]));
    for (const g of groups) {
      for (let i = 0; i < g.items.length; i++) {
        const item = g.items[i], a = item.animation;
        if (a.effect !== 'color') continue;
        item.fromColors = Object.create(null);
        for (const id of a.targets) {
          let color = colors.get(id)?.[a.channel];
          for (const prior of g.items.slice(0, i)) {
            const b = prior.animation;
            if (b.effect === 'color' && b.channel === a.channel && b.targets.includes(id) && prior.start <= item.start)
              color = mixColor(prior.fromColors[id], b.color, progress(prior, item.start));
          }
          item.fromColors[id] = color;
        }
      }
      for (const item of g.items) if (item.animation.effect === 'color')
        for (const id of item.animation.targets) if (colors.has(id)) colors.get(id)[item.animation.channel] = targetColor(item.fromColors[id], item.animation.color);
    }
    return {groups, steps: groups.length - 1};
  }
  function frame(input, step, time = Infinity, options = {}) {
    const page = clone(input), plan = options.plan || compile(input);
    if (!Number.isInteger(step) || step < 0 || step > plan.steps || !(time >= 0)) throw new RangeError('Invalid animation position');
    const objects = new Map(page.objects.map(o => [o.id, o])), visuals = Object.create(null), firstVisibility = new Set(), moving = new Map();
    for (const a of input.animations || []) if (a.effect === 'fade' || a.effect === 'wipe')
      for (const id of a.targets) if (!firstVisibility.has(id)) {
        firstVisibility.add(id); visuals[id] = {opacity: a.mode === 'in' ? 0 : 1, reveal: null};
      }
    for (const group of plan.groups) {
      if (group.index > step) break;
      const at = group.index < step ? Infinity : time;
      for (const item of group.items) {
        if (at < item.start) continue;
        const a = item.animation, q = progress(item, at);
        for (const id of a.targets) {
          const object = objects.get(id); if (!object) continue;
          if (a.effect === 'move') {
            const offset = moving.get(id) || {x: 0, y: 0, active: false};
            offset.x += a.dx * q; offset.y += a.dy * q;
            offset.active ||= q > 0 && !!(a.dx || a.dy); moving.set(id, offset);
          } else if (a.effect === 'color') {
            const color = mixColor(item.fromColors[id], a.color, q);
            if (a.channel === 'fill' && object.type === 'text' && Array.isArray(color)) {
              if (q > 0) object.runs.forEach((run, index) => { run.fill = color[index]; });
            } else object.style[a.channel] = color;
          }
          else {
            const fraction = a.mode === 'in' ? q : 1 - q;
            visuals[id] = a.effect === 'fade' ? {opacity: fraction, reveal: null}
              : {opacity: 1, reveal: {fraction, direction: a.direction, animationId: a.id}};
          }
        }
      }
    }
    for (const [id, offset] of moving) {
      const o = objects.get(id);
      if (o.type !== 'connector') { o.matrix[4] += offset.x; o.matrix[5] += offset.y; continue; }
      for (const point of [o.from, o.to, ...o.waypoints]) { point.x += offset.x; point.y += offset.y; }
      // An independently animated arrow moves freely; editable connections stay intact.
      // Label offsets and outward normals are vectors, unaffected by translation.
      if (offset.active) { o.from.objectId = null; o.to.objectId = null; }
    }
    return {page, visuals};
  }
  return {compile, frame};
}));
