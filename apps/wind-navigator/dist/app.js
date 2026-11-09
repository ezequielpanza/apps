(function () {
	'use strict';

	/** @returns {void} */
	function noop() {}

	function run(fn) {
		return fn();
	}

	function blank_object() {
		return Object.create(null);
	}

	/**
	 * @param {Function[]} fns
	 * @returns {void}
	 */
	function run_all(fns) {
		fns.forEach(run);
	}

	/**
	 * @param {any} thing
	 * @returns {thing is Function}
	 */
	function is_function(thing) {
		return typeof thing === 'function';
	}

	/** @returns {boolean} */
	function safe_not_equal(a, b) {
		return a != a ? b == b : a !== b || (a && typeof a === 'object') || typeof a === 'function';
	}

	/** @returns {boolean} */
	function is_empty(obj) {
		return Object.keys(obj).length === 0;
	}

	/** @type {typeof globalThis} */
	const globals =
		typeof window !== 'undefined'
			? window
			: typeof globalThis !== 'undefined'
			? globalThis
			: // @ts-ignore Node typings have this
			  global;

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @returns {void}
	 */
	function append(target, node) {
		target.appendChild(node);
	}

	/**
	 * @param {Node} target
	 * @param {string} style_sheet_id
	 * @param {string} styles
	 * @returns {void}
	 */
	function append_styles(target, style_sheet_id, styles) {
		const append_styles_to = get_root_for_style(target);
		if (!append_styles_to.getElementById(style_sheet_id)) {
			const style = element('style');
			style.id = style_sheet_id;
			style.textContent = styles;
			append_stylesheet(append_styles_to, style);
		}
	}

	/**
	 * @param {Node} node
	 * @returns {ShadowRoot | Document}
	 */
	function get_root_for_style(node) {
		if (!node) return document;
		const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
		if (root && /** @type {ShadowRoot} */ (root).host) {
			return /** @type {ShadowRoot} */ (root);
		}
		return node.ownerDocument;
	}

	/**
	 * @param {ShadowRoot | Document} node
	 * @param {HTMLStyleElement} style
	 * @returns {CSSStyleSheet}
	 */
	function append_stylesheet(node, style) {
		append(/** @type {Document} */ (node).head || node, style);
		return style.sheet;
	}

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @param {Node} [anchor]
	 * @returns {void}
	 */
	function insert(target, node, anchor) {
		target.insertBefore(node, anchor || null);
	}

	/**
	 * @param {Node} node
	 * @returns {void}
	 */
	function detach(node) {
		if (node.parentNode) {
			node.parentNode.removeChild(node);
		}
	}

	/**
	 * @template {keyof HTMLElementTagNameMap} K
	 * @param {K} name
	 * @returns {HTMLElementTagNameMap[K]}
	 */
	function element(name) {
		return document.createElement(name);
	}

	/**
	 * @param {string} data
	 * @returns {Text}
	 */
	function text(data) {
		return document.createTextNode(data);
	}

	/**
	 * @returns {Text} */
	function space() {
		return text(' ');
	}

	/**
	 * @param {EventTarget} node
	 * @param {string} event
	 * @param {EventListenerOrEventListenerObject} handler
	 * @param {boolean | AddEventListenerOptions | EventListenerOptions} [options]
	 * @returns {() => void}
	 */
	function listen(node, event, handler, options) {
		node.addEventListener(event, handler, options);
		return () => node.removeEventListener(event, handler, options);
	}

	/**
	 * @param {Element} node
	 * @param {string} attribute
	 * @param {string} [value]
	 * @returns {void}
	 */
	function attr(node, attribute, value) {
		if (value == null) node.removeAttribute(attribute);
		else if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
	}

	/** @returns {number} */
	function to_number(value) {
		return value === '' ? null : +value;
	}

	/**
	 * @param {Element} element
	 * @returns {ChildNode[]}
	 */
	function children(element) {
		return Array.from(element.childNodes);
	}

	/**
	 * @param {Text} text
	 * @param {unknown} data
	 * @returns {void}
	 */
	function set_data(text, data) {
		data = '' + data;
		if (text.data === data) return;
		text.data = /** @type {string} */ (data);
	}

	/**
	 * @returns {void} */
	function set_input_value(input, value) {
		input.value = value == null ? '' : value;
	}

	/**
	 * @returns {void} */
	function select_option(select, value, mounting) {
		for (let i = 0; i < select.options.length; i += 1) {
			const option = select.options[i];
			if (option.__value === value) {
				option.selected = true;
				return;
			}
		}
		if (!mounting || value !== undefined) {
			select.selectedIndex = -1; // no option should be selected
		}
	}

	function select_value(select) {
		const selected_option = select.querySelector(':checked');
		return selected_option && selected_option.__value;
	}

	/**
	 * @typedef {Node & {
	 * 	claim_order?: number;
	 * 	hydrate_init?: true;
	 * 	actual_end_child?: NodeEx;
	 * 	childNodes: NodeListOf<NodeEx>;
	 * }} NodeEx
	 */

	/** @typedef {ChildNode & NodeEx} ChildNodeEx */

	/** @typedef {NodeEx & { claim_order: number }} NodeEx2 */

	/**
	 * @typedef {ChildNodeEx[] & {
	 * 	claim_info?: {
	 * 		last_index: number;
	 * 		total_claimed: number;
	 * 	};
	 * }} ChildNodeArray
	 */

	let current_component;

	/** @returns {void} */
	function set_current_component(component) {
		current_component = component;
	}

	function get_current_component() {
		if (!current_component) throw new Error('Function called outside component initialization');
		return current_component;
	}

	/**
	 * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
	 * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
	 * it can be called from an external module).
	 *
	 * If a function is returned _synchronously_ from `onMount`, it will be called when the component is unmounted.
	 *
	 * `onMount` does not run inside a [server-side component](https://svelte.dev/docs#run-time-server-side-component-api).
	 *
	 * https://svelte.dev/docs/svelte#onmount
	 * @template T
	 * @param {() => import('./private.js').NotFunction<T> | Promise<import('./private.js').NotFunction<T>> | (() => any)} fn
	 * @returns {void}
	 */
	function onMount(fn) {
		get_current_component().$$.on_mount.push(fn);
	}

	/**
	 * Schedules a callback to run immediately before the component is unmounted.
	 *
	 * Out of `onMount`, `beforeUpdate`, `afterUpdate` and `onDestroy`, this is the
	 * only one that runs inside a server-side component.
	 *
	 * https://svelte.dev/docs/svelte#ondestroy
	 * @param {() => any} fn
	 * @returns {void}
	 */
	function onDestroy(fn) {
		get_current_component().$$.on_destroy.push(fn);
	}

	const dirty_components = [];
	const binding_callbacks = [];

	let render_callbacks = [];

	const flush_callbacks = [];

	const resolved_promise = /* @__PURE__ */ Promise.resolve();

	let update_scheduled = false;

	/** @returns {void} */
	function schedule_update() {
		if (!update_scheduled) {
			update_scheduled = true;
			resolved_promise.then(flush);
		}
	}

	/** @returns {void} */
	function add_render_callback(fn) {
		render_callbacks.push(fn);
	}

	// flush() calls callbacks in this order:
	// 1. All beforeUpdate callbacks, in order: parents before children
	// 2. All bind:this callbacks, in reverse order: children before parents.
	// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
	//    for afterUpdates called during the initial onMount, which are called in
	//    reverse order: children before parents.
	// Since callbacks might update component values, which could trigger another
	// call to flush(), the following steps guard against this:
	// 1. During beforeUpdate, any updated components will be added to the
	//    dirty_components array and will cause a reentrant call to flush(). Because
	//    the flush index is kept outside the function, the reentrant call will pick
	//    up where the earlier call left off and go through all dirty components. The
	//    current_component value is saved and restored so that the reentrant call will
	//    not interfere with the "parent" flush() call.
	// 2. bind:this callbacks cannot trigger new flush() calls.
	// 3. During afterUpdate, any updated components will NOT have their afterUpdate
	//    callback called a second time; the seen_callbacks set, outside the flush()
	//    function, guarantees this behavior.
	const seen_callbacks = new Set();

	let flushidx = 0; // Do *not* move this inside the flush() function

	/** @returns {void} */
	function flush() {
		// Do not reenter flush while dirty components are updated, as this can
		// result in an infinite loop. Instead, let the inner flush handle it.
		// Reentrancy is ok afterwards for bindings etc.
		if (flushidx !== 0) {
			return;
		}
		const saved_component = current_component;
		do {
			// first, call beforeUpdate functions
			// and update components
			try {
				while (flushidx < dirty_components.length) {
					const component = dirty_components[flushidx];
					flushidx++;
					set_current_component(component);
					update(component.$$);
				}
			} catch (e) {
				// reset dirty state to not end up in a deadlocked state and then rethrow
				dirty_components.length = 0;
				flushidx = 0;
				throw e;
			}
			set_current_component(null);
			dirty_components.length = 0;
			flushidx = 0;
			while (binding_callbacks.length) binding_callbacks.pop()();
			// then, once components are updated, call
			// afterUpdate functions. This may cause
			// subsequent updates...
			for (let i = 0; i < render_callbacks.length; i += 1) {
				const callback = render_callbacks[i];
				if (!seen_callbacks.has(callback)) {
					// ...so guard against infinite loops
					seen_callbacks.add(callback);
					callback();
				}
			}
			render_callbacks.length = 0;
		} while (dirty_components.length);
		while (flush_callbacks.length) {
			flush_callbacks.pop()();
		}
		update_scheduled = false;
		seen_callbacks.clear();
		set_current_component(saved_component);
	}

	/** @returns {void} */
	function update($$) {
		if ($$.fragment !== null) {
			$$.update();
			run_all($$.before_update);
			const dirty = $$.dirty;
			$$.dirty = [-1];
			$$.fragment && $$.fragment.p($$.ctx, dirty);
			$$.after_update.forEach(add_render_callback);
		}
	}

	/**
	 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
	 * @param {Function[]} fns
	 * @returns {void}
	 */
	function flush_render_callbacks(fns) {
		const filtered = [];
		const targets = [];
		render_callbacks.forEach((c) => (fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c)));
		targets.forEach((c) => c());
		render_callbacks = filtered;
	}

	const outroing = new Set();

	/**
	 * @param {import('./private.js').Fragment} block
	 * @param {0 | 1} [local]
	 * @returns {void}
	 */
	function transition_in(block, local) {
		if (block && block.i) {
			outroing.delete(block);
			block.i(local);
		}
	}

	/** @typedef {1} INTRO */
	/** @typedef {0} OUTRO */
	/** @typedef {{ direction: 'in' | 'out' | 'both' }} TransitionOptions */
	/** @typedef {(node: Element, params: any, options: TransitionOptions) => import('../transition/public.js').TransitionConfig} TransitionFn */

	/**
	 * @typedef {Object} Outro
	 * @property {number} r
	 * @property {Function[]} c
	 * @property {Object} p
	 */

	/**
	 * @typedef {Object} PendingProgram
	 * @property {number} start
	 * @property {INTRO|OUTRO} b
	 * @property {Outro} [group]
	 */

	/**
	 * @typedef {Object} Program
	 * @property {number} a
	 * @property {INTRO|OUTRO} b
	 * @property {1|-1} d
	 * @property {number} duration
	 * @property {number} start
	 * @property {number} end
	 * @property {Outro} [group]
	 */

	// general each functions:

	function ensure_array_like(array_like_or_iterator) {
		return array_like_or_iterator?.length !== undefined
			? array_like_or_iterator
			: Array.from(array_like_or_iterator);
	}

	// keyed each functions:

	/** @returns {void} */
	function destroy_block(block, lookup) {
		block.d(1);
		lookup.delete(block.key);
	}

	/** @returns {any[]} */
	function update_keyed_each(
		old_blocks,
		dirty,
		get_key,
		dynamic,
		ctx,
		list,
		lookup,
		node,
		destroy,
		create_each_block,
		next,
		get_context
	) {
		let o = old_blocks.length;
		let n = list.length;
		let i = o;
		const old_indexes = {};
		while (i--) old_indexes[old_blocks[i].key] = i;
		const new_blocks = [];
		const new_lookup = new Map();
		const deltas = new Map();
		const updates = [];
		i = n;
		while (i--) {
			const child_ctx = get_context(ctx, list, i);
			const key = get_key(child_ctx);
			let block = lookup.get(key);
			if (!block) {
				block = create_each_block(key, child_ctx);
				block.c();
			} else {
				// defer updates until all the DOM shuffling is done
				updates.push(() => block.p(child_ctx, dirty));
			}
			new_lookup.set(key, (new_blocks[i] = block));
			if (key in old_indexes) deltas.set(key, Math.abs(i - old_indexes[key]));
		}
		const will_move = new Set();
		const did_move = new Set();
		/** @returns {void} */
		function insert(block) {
			transition_in(block, 1);
			block.m(node, next);
			lookup.set(block.key, block);
			next = block.first;
			n--;
		}
		while (o && n) {
			const new_block = new_blocks[n - 1];
			const old_block = old_blocks[o - 1];
			const new_key = new_block.key;
			const old_key = old_block.key;
			if (new_block === old_block) {
				// do nothing
				next = new_block.first;
				o--;
				n--;
			} else if (!new_lookup.has(old_key)) {
				// remove old block
				destroy(old_block, lookup);
				o--;
			} else if (!lookup.has(new_key) || will_move.has(new_key)) {
				insert(new_block);
			} else if (did_move.has(old_key)) {
				o--;
			} else if (deltas.get(new_key) > deltas.get(old_key)) {
				did_move.add(new_key);
				insert(new_block);
			} else {
				will_move.add(old_key);
				o--;
			}
		}
		while (o--) {
			const old_block = old_blocks[o];
			if (!new_lookup.has(old_block.key)) destroy(old_block, lookup);
		}
		while (n) insert(new_blocks[n - 1]);
		run_all(updates);
		return new_blocks;
	}

	/** @returns {void} */
	function mount_component(component, target, anchor) {
		const { fragment, after_update } = component.$$;
		fragment && fragment.m(target, anchor);
		// onMount happens before the initial afterUpdate
		add_render_callback(() => {
			const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
			// if the component was destroyed immediately
			// it will update the `$$.on_destroy` reference to `null`.
			// the destructured on_destroy may still reference to the old array
			if (component.$$.on_destroy) {
				component.$$.on_destroy.push(...new_on_destroy);
			} else {
				// Edge case - component was destroyed immediately,
				// most likely as a result of a binding initialising
				run_all(new_on_destroy);
			}
			component.$$.on_mount = [];
		});
		after_update.forEach(add_render_callback);
	}

	/** @returns {void} */
	function destroy_component(component, detaching) {
		const $$ = component.$$;
		if ($$.fragment !== null) {
			flush_render_callbacks($$.after_update);
			run_all($$.on_destroy);
			$$.fragment && $$.fragment.d(detaching);
			// TODO null out other refs, including component.$$ (but need to
			// preserve final state?)
			$$.on_destroy = $$.fragment = null;
			$$.ctx = [];
		}
	}

	/** @returns {void} */
	function make_dirty(component, i) {
		if (component.$$.dirty[0] === -1) {
			dirty_components.push(component);
			schedule_update();
			component.$$.dirty.fill(0);
		}
		component.$$.dirty[(i / 31) | 0] |= 1 << i % 31;
	}

	// TODO: Document the other params
	/**
	 * @param {SvelteComponent} component
	 * @param {import('./public.js').ComponentConstructorOptions} options
	 *
	 * @param {import('./utils.js')['not_equal']} not_equal Used to compare props and state values.
	 * @param {(target: Element | ShadowRoot) => void} [append_styles] Function that appends styles to the DOM when the component is first initialised.
	 * This will be the `add_css` function from the compiled component.
	 *
	 * @returns {void}
	 */
	function init(
		component,
		options,
		instance,
		create_fragment,
		not_equal,
		props,
		append_styles = null,
		dirty = [-1]
	) {
		const parent_component = current_component;
		set_current_component(component);
		/** @type {import('./private.js').T$$} */
		const $$ = (component.$$ = {
			fragment: null,
			ctx: [],
			// state
			props,
			update: noop,
			not_equal,
			bound: blank_object(),
			// lifecycle
			on_mount: [],
			on_destroy: [],
			on_disconnect: [],
			before_update: [],
			after_update: [],
			context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
			// everything else
			callbacks: blank_object(),
			dirty,
			skip_bound: false,
			root: options.target || parent_component.$$.root
		});
		append_styles && append_styles($$.root);
		let ready = false;
		$$.ctx = instance
			? instance(component, options.props || {}, (i, ret, ...rest) => {
					const value = rest.length ? rest[0] : ret;
					if ($$.ctx && not_equal($$.ctx[i], ($$.ctx[i] = value))) {
						if (!$$.skip_bound && $$.bound[i]) $$.bound[i](value);
						if (ready) make_dirty(component, i);
					}
					return ret;
			  })
			: [];
		$$.update();
		ready = true;
		run_all($$.before_update);
		// `false` as a special case of no DOM component
		$$.fragment = create_fragment ? create_fragment($$.ctx) : false;
		if (options.target) {
			if (options.hydrate) {
				// TODO: what is the correct type here?
				// @ts-expect-error
				const nodes = children(options.target);
				$$.fragment && $$.fragment.l(nodes);
				nodes.forEach(detach);
			} else {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				$$.fragment && $$.fragment.c();
			}
			if (options.intro) transition_in(component.$$.fragment);
			mount_component(component, options.target, options.anchor);
			flush();
		}
		set_current_component(parent_component);
	}

	/**
	 * Base class for Svelte components. Used when dev=false.
	 *
	 * @template {Record<string, any>} [Props=any]
	 * @template {Record<string, any>} [Events=any]
	 */
	class SvelteComponent {
		/**
		 * ### PRIVATE API
		 *
		 * Do not use, may change at any time
		 *
		 * @type {any}
		 */
		$$ = undefined;
		/**
		 * ### PRIVATE API
		 *
		 * Do not use, may change at any time
		 *
		 * @type {any}
		 */
		$$set = undefined;

		/** @returns {void} */
		$destroy() {
			destroy_component(this, 1);
			this.$destroy = noop;
		}

		/**
		 * @template {Extract<keyof Events, string>} K
		 * @param {K} type
		 * @param {((e: Events[K]) => void) | null | undefined} callback
		 * @returns {() => void}
		 */
		$on(type, callback) {
			if (!is_function(callback)) {
				return noop;
			}
			const callbacks = this.$$.callbacks[type] || (this.$$.callbacks[type] = []);
			callbacks.push(callback);
			return () => {
				const index = callbacks.indexOf(callback);
				if (index !== -1) callbacks.splice(index, 1);
			};
		}

		/**
		 * @param {Partial<Props>} props
		 * @returns {void}
		 */
		$set(props) {
			if (this.$$set && !is_empty(props)) {
				this.$$.skip_bound = true;
				this.$$set(props);
				this.$$.skip_bound = false;
			}
		}
	}

	/**
	 * @typedef {Object} CustomElementPropDefinition
	 * @property {string} [attribute]
	 * @property {boolean} [reflect]
	 * @property {'String'|'Boolean'|'Number'|'Array'|'Object'} [type]
	 */

	// generated during release, do not modify

	const PUBLIC_VERSION = '4';

	if (typeof window !== 'undefined')
		// @ts-ignore
		(window.__svelte || (window.__svelte = { v: new Set() })).v.add(PUBLIC_VERSION);

	const map = L.map('map', { zoomControl:false }).setView([18.1, -66.5], 6);
	L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);
	const seamarks = L.tileLayer('https://t1.openseamap.org/seamark/{z}/{x}/{y}.png', {maxZoom:18, attribution:'&copy; <a href="https://www.openseamap.org/">OpenSeaMap</a> contributors'}).addTo(map);

	const values = new Map();
	var windyStore = { get(key){ return values.get(key); }, set(key,value){ values.set(key,value); return true; } };

	// Never substitute a different model under the original model's label.
	const models = {gfs:'gfs_global', ecmwf:'ecmwf_ifs', icon:'icon_global'};
	const waveModels = {gfsWaves:'ncep_gfswave025',ecmwfWaves:'ecmwf_wam'};
	const times = a => a.map(v=>Date.parse(v.endsWith('Z')?v:v+'Z'));
	async function waveForecast(model, options) {
	  const params = new URLSearchParams({latitude:String(options.lat),longitude:String(options.lon),
	    models:waveModels[model],timezone:'GMT',forecast_days:String(Math.min(15,options.days)),
	    hourly:'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,secondary_swell_wave_height,secondary_swell_wave_direction,secondary_swell_wave_period,wind_wave_height,wind_wave_direction,wind_wave_period'});
	  const response = await fetch('https://marine-api.open-meteo.com/v1/marine?'+params);
	  if (!response.ok) throw new Error(`Open-Meteo olas: HTTP ${response.status}`);
	  const {hourly:h} = await response.json();
	  if (!h?.time) throw new Error('Open-Meteo no devolvió datos de olas.');
	  return {data:{data:{ts:times(h.time),waves:h.wave_height,wavesDir:h.wave_direction,wavesPeriod:h.wave_period,
	    swell1:h.swell_wave_height,swell1Dir:h.swell_wave_direction,swell1Period:h.swell_wave_period,
	    swell2:h.secondary_swell_wave_height,swell2Dir:h.secondary_swell_wave_direction,swell2Period:h.secondary_swell_wave_period,
	    windWaves:h.wind_wave_height,windWavesDir:h.wind_wave_direction,windWavesPeriod:h.wind_wave_period}}};
	}
	async function getPointForecastData(model, options) {
	  if (waveModels[model]) return waveForecast(model,options);
	  if (!models[model]) throw new Error(`Modelo ${model} aún no disponible en Wind Navigator.`);
	  const params = new URLSearchParams({
	    latitude:String(options.lat), longitude:String(options.lon), models:models[model],
	    hourly:'temperature_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,dew_point_2m',
	    wind_speed_unit:'ms', timezone:'GMT', forecast_days:String(Math.min(15,options.days)),
	    cell_selection:'sea'
	  });
	  const response=await fetch('https://api.open-meteo.com/v1/forecast?'+params);
	  if (!response.ok) throw new Error(`Open-Meteo: HTTP ${response.status}`);
	  const {hourly:h}=await response.json();
	  if (!h?.time) throw new Error('Open-Meteo no devolvió datos horarios.');
	  const kelvin=a=>a?.map(v=>v==null?null:v+273.15);
	  const ts=times(h.time);
	  return {data:{data:{ts,temperature:kelvin(h.temperature_2m),feelTemperature:kelvin(h.apparent_temperature),
	    precipAmount:h.precipitation,wind:h.wind_speed_10m,windDir:h.wind_direction_10m,windGust:h.wind_gusts_10m,
	    clouds:h.cloud_cover},meteogram:{ts,dewPoint:kelvin(h.dew_point_2m)}}};
	}

	const color = () => '';
	var colors = {wind:{color},rain:{color}};

	function getGPSlocation(options={}) {
	  return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(
	    p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude,source:'gps'}),
	    reject,{enableHighAccuracy:options.enableHighAccuracy,timeout:options.timeout,maximumAge:options.maximumAge}));
	}

	const rad = degrees => degrees * Math.PI / 180;
	function visibleMapCenter(mapRect, viewport, topPanel, bottomPanel) {
	    const left = Math.max(mapRect.left, viewport.left), right = Math.min(mapRect.right, viewport.right);
	    let top = Math.max(mapRect.top, viewport.top), bottom = Math.min(mapRect.bottom, viewport.bottom);
	    if (right <= left || bottom <= top) return null;
	    if (topPanel && topPanel.right > left && topPanel.left < right && topPanel.bottom > top && topPanel.top < bottom) top = Math.min(bottom, topPanel.bottom);
	    if (bottomPanel && bottomPanel.right > left && bottomPanel.left < right && bottomPanel.bottom > top && bottomPanel.top < bottom) bottom = Math.max(top, bottomPanel.top);
	    if (bottom <= top) return null;
	    return { x: (left + right) / 2 - mapRect.left, y: (top + bottom) / 2 - mapRect.top };
	}
	function destinationAtBearing(start, bearing, distance) {
	    const latitude = rad(start.lat), longitude = rad(start.lon), angle = rad(bearing), arc = distance / 3440.065;
	    const endLat = Math.asin(Math.sin(latitude) * Math.cos(arc) + Math.cos(latitude) * Math.sin(arc) * Math.cos(angle));
	    const endLon = longitude + Math.atan2(Math.sin(angle) * Math.sin(arc) * Math.cos(latitude), Math.cos(arc) - Math.sin(latitude) * Math.sin(endLat));
	    return { lat: endLat * 180 / Math.PI, lon: endLon * 180 / Math.PI };
	}
	function distanceNm(a, b) {
	    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
	    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
	    return 3440.065 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
	}
	function bearingTrue(a, b) {
	    const dLon = rad(b.lon - a.lon), lat1 = rad(a.lat), lat2 = rad(b.lat);
	    return (Math.atan2(Math.sin(dLon) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)) * 180 / Math.PI + 360) % 360;
	}
	function courseFromFixes(previous, current) {
	    if (!previous || !current || current.timestamp <= previous.timestamp) return null;
	    const distanceMeters = distanceNm(previous, current) * 1852;
	    const uncertaintyMeters = Math.max(5, previous.accuracy || 0, current.accuracy || 0);
	    if (!Number.isFinite(distanceMeters) || distanceMeters < uncertaintyMeters) return null;
	    return bearingTrue(previous, current);
	}
	function projectOnLeg(position, start, end) {
	    const scale = Math.cos(rad(position.lat));
	    const x = point => (((point.lon - position.lon + 540) % 360) - 180) * scale * 60;
	    const y = point => (point.lat - position.lat) * 60;
	    const ax = x(start), ay = y(start), bx = x(end), by = y(end);
	    const dx = bx - ax, dy = by - ay, lengthSquared = dx * dx + dy * dy;
	    if (lengthSquared < 1e-12) return { fraction: 0, crossTrack: Math.hypot(ax, ay) };
	    const fraction = -(ax * dx + ay * dy) / lengthSquared;
	    return { fraction, crossTrack: Math.abs(ax * dy - ay * dx) / Math.sqrt(lengthSquared) };
	}
	function routeProgress(position, points, targetIndex) {
	    if (!position || points.length < 2 || targetIndex < 0 || targetIndex >= points.length) return null;
	    const lengths = points.slice(1).map((point, i) => distanceNm(points[i], point));
	    const total = lengths.reduce((sum, length) => sum + length, 0);
	    if (!Number.isFinite(total) || total <= 0) return null;
	    if (targetIndex === 0) return 0;
	    const leg = targetIndex - 1;
	    const fraction = Math.max(0, Math.min(1, projectOnLeg(position, points[leg], points[targetIndex]).fraction));
	    return (lengths.slice(0, leg).reduce((sum, length) => sum + length, 0) + lengths[leg] * fraction) / total;
	}
	function averageRouteSpeed(position, points, targetIndex, departureTime, fixTime) {
	    if (!Number.isFinite(departureTime) || !Number.isFinite(fixTime) || fixTime - departureTime < 60000) return null;
	    const progress = routeProgress(position, points, targetIndex);
	    if (progress === null) return null;
	    const total = points.slice(1).reduce((sum, point, i) => sum + distanceNm(points[i], point), 0);
	    const speed = progress * total / ((fixTime - departureTime) / 3600000);
	    return Number.isFinite(speed) ? speed : null;
	}
	function chooseNextWaypoint(position, points) {
	    if (!position || !points.length) return -1;
	    if (points.length === 1) return 0;
	    let best = Infinity, index = 1;
	    for (let i = 0; i < points.length - 1; i++) {
	        const leg = projectOnLeg(position, points[i], points[i + 1]);
	        const fraction = Math.max(0, Math.min(1, leg.fraction));
	        const alongBeyond = Math.abs(leg.fraction - fraction) * distanceNm(points[i], points[i + 1]);
	        const distance = Math.hypot(leg.crossTrack, alongBeyond);
	        if (distance < best) { best = distance; index = i === 0 && leg.fraction < 0 ? 0 : i + 1; }
	    }
	    return index;
	}
	function reachedWaypoint(position, points, index) {
	    if (!position || index < 0 || index >= points.length - 1) return false;
	    const distance = distanceNm(position, points[index]);
	    if (distance <= 0.1) return true;
	    if (index === 0 || distance > 1) return false;
	    const leg = projectOnLeg(position, points[index - 1], points[index]);
	    return leg.fraction >= 1 && leg.crossTrack <= 0.3;
	}
	function advanceWaypoint(position, points, index, confirmations) {
	    const nextConfirmations = reachedWaypoint(position, points, index) ? confirmations + 1 : 0;
	    return nextConfirmations >= 2 && index < points.length - 1
	        ? { index: index + 1, confirmations: 0 }
	        : { index, confirmations: nextConfirmations };
	}
	function navigationMetrics(position, points, index, speedKnots) {
	    if (!position || index < 0 || index >= points.length) return null;
	    const distanceNext = distanceNm(position, points[index]);
	    let distanceFinal = distanceNext;
	    for (let i = index; i < points.length - 1; i++) distanceFinal += distanceNm(points[i], points[i + 1]);
	    const speed = Number.isFinite(speedKnots) && speedKnots >= 0.5 ? speedKnots : null;
	    return { bearing: distanceNext > 0.001 ? bearingTrue(position, points[index]) : null, distanceNext, distanceFinal, hoursNext: speed ? distanceNext / speed : null, hoursFinal: speed ? distanceFinal / speed : null };
	}

	// Keep the visible seven days before today selectable on the departure dial.
	function earliestDeparture(now = new Date(), savedTimestamp = null) {
	    const start = new Date(now);
	    start.setHours(0, 0, 0, 0);
	    start.setDate(start.getDate() - 7);
	    return Number.isFinite(savedTimestamp) ? Math.min(start.getTime(), savedTimestamp) : start.getTime();
	}

	function restoredDeparture(value, now = Date.now()) {
	    const saved = typeof value === 'string' ? new Date(value).getTime() : NaN;
	    return Number.isFinite(saved) ? saved : Math.floor(now / 60000) * 60000;
	}

	function nearestForecastIndex(timestamps, target, now = Date.now()) {
	    if (!Array.isArray(timestamps) || !timestamps.length || !Number.isFinite(target)) return -1;
	    let closest = -1, delta = Infinity, earliest = Infinity;
	    timestamps.forEach((raw, index) => {
	        const value = Number(raw);
	        if (!Number.isFinite(value) || value <= 0) return;
	        const timestamp = value < 1e12 ? value * 1000 : value;
	        earliest = Math.min(earliest, timestamp);
	        const distance = Math.abs(timestamp - target);
	        if (distance < delta) { delta = distance; closest = index; }
	    });
	    // Never fill a past time outside the model's coverage with a later forecast.
	    if (target < now && target < earliest) return -1;
	    return delta <= 4 * 3600000 ? closest : -1;
	}

	// A model's last available value must not be carried beyond its coverage.
	function coveredForecastIndex(timestamps, target, now = Date.now()) {
	    if (!Array.isArray(timestamps) || !Number.isFinite(target)) return -1;
	    const valid = timestamps.map(Number).filter(value => Number.isFinite(value) && value > 0)
	        .map(value => value < 1e12 ? value * 1000 : value);
	    if (!valid.length || target < Math.min(...valid) || target > Math.max(...valid)) return -1;
	    return nearestForecastIndex(timestamps, target, now);
	}

	// Helpers for a live forecast; these never modify the saved route.
	const LIVE_SPEED_WINDOW_MS = 5 * 1000;
	const TEMPORARY_PLAN_KEY = 'route-builder-live-plan-backup-v1';

	function currentRouteSpeed(speed) {
	    return typeof speed === 'number' && Number.isFinite(speed) && speed >= 0.1 ? speed : null;
	}

	function prepareLiveRefresh(position, points, targetId, now) {
	    const targetIndex = points.findIndex(point => point.id === targetId);
	    const speed = currentRouteSpeed(position?.speed);
	    if (!position || !Number.isFinite(position.timestamp) || position.timestamp > now || now - position.timestamp > 30000 ||
	        !Number.isFinite(position.lat) || !Number.isFinite(position.lon) || targetIndex < 1 || speed === null) return null;
	    return { points: [{ ...points[0], lat: position.lat, lon: position.lon }, ...points.slice(targetIndex)], speed };
	}

	// Reconstruct a complete route from the hidden live start, its passed points,
	// and the remaining route. The boat position can be the last live fix when
	// leaving live mode, or a newly validated fix when saving a slot.
	function buildLiveRoutePoints(pastWaypoints, points, targetId, boatPosition = points?.[0]) {
	    if (!Array.isArray(pastWaypoints) || !Array.isArray(points) || !boatPosition ||
	        !Number.isFinite(boatPosition.lat) || Math.abs(boatPosition.lat) > 90 ||
	        !Number.isFinite(boatPosition.lon) || Math.abs(boatPosition.lon) > 180) return null;
	    const targetIndex = points.findIndex(point => point.id === targetId);
	    if (targetIndex < 1) return null;
	    const passed = [...pastWaypoints.map(entry => entry.point), ...points.slice(1, targetIndex)];
	    const seen = new Set();
	    const uniquePassed = passed.filter(point => {
	        if (!point || seen.has(point.id)) return false;
	        seen.add(point.id);
	        return true;
	    });
	    const snapshotPoints = [...uniquePassed, { ...points[0], lat: boatPosition.lat, lon: boatPosition.lon }, ...points.slice(targetIndex)]
	        .map(point => ({ id: point.id, lat: point.lat, lon: point.lon }));
	    const ids = snapshotPoints.map(point => point.id);
	    if (ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length ||
	        snapshotPoints.some(point => !Number.isFinite(point.lat) || Math.abs(point.lat) > 90 || !Number.isFinite(point.lon) || Math.abs(point.lon) > 180)) return null;
	    return snapshotPoints;
	}

	// User-requested saves require a fresh GPS position. Leaving live mode uses
	// buildLiveRoutePoints directly so a brief GPS timeout does not discard the
	// last position already applied to the hidden start point.
	function buildLiveRouteSnapshot(pastWaypoints, points, position, targetId, now) {
	    if (!position || !Number.isFinite(now) || !Number.isFinite(position.timestamp) || position.timestamp > now || now - position.timestamp > 30000 ||
	        !Number.isFinite(position.lat) || Math.abs(position.lat) > 90 || !Number.isFinite(position.lon) || Math.abs(position.lon) > 180) return null;
	    return buildLiveRoutePoints(pastWaypoints, points, targetId, position);
	}

	function capturePlanningSnapshot(plan) {
	    if (!plan || !Array.isArray(plan.points) || !Number.isSafeInteger(plan.nextPointId) ||
	        typeof plan.departureDateTime !== 'string' || !Number.isFinite(new Date(plan.departureDateTime).getTime()) ||
	        !Number.isFinite(plan.speedKnots) || plan.speedKnots <= 0) return null;
	    return {
	        version: 1,
	        points: plan.points.map(point => ({ ...point })),
	        nextPointId: plan.nextPointId,
	        departureDateTime: plan.departureDateTime,
	        speedKnots: plan.speedKnots,
	    };
	}

	function saveTemporaryPlan(storage, plan) {
	    const snapshot = capturePlanningSnapshot(plan);
	    if (!snapshot) return false;
	    try {
	        storage.setItem(TEMPORARY_PLAN_KEY, JSON.stringify(snapshot));
	        return true;
	    } catch { return false; }
	}

	function loadTemporaryPlan(storage, parseSnapshot) {
	    try { return parseSnapshot(storage.getItem(TEMPORARY_PLAN_KEY)); }
	    catch { return null; }
	}

	function clearTemporaryPlan(storage) {
	    try { storage.removeItem(TEMPORARY_PLAN_KEY); return true; }
	    catch { return false; }
	}

	function liveAverageSpeed(samples, now, windowMs = LIVE_SPEED_WINDOW_MS) {
	    if (!Number.isFinite(now) || !Number.isFinite(windowMs) || windowMs <= 0) return null;
	    const valid = samples.filter(s => Number.isFinite(s.timestamp) && s.timestamp <= now && s.timestamp >= now - windowMs && Number.isFinite(s.speed) && s.speed >= 0);
	    if (!valid.length || !valid.some(sample => now - sample.timestamp <= 30000)) return null;
	    return valid.reduce((sum, s) => sum + s.speed, 0) / valid.length;
	}

	const config = {
	    name: 'windy-plugin-navigator',
	    version: '0.1.432',
	    title: 'Wind Navigator'};

	/* src/plugin.svelte generated by Svelte v4.2.20 */

	const { Map: Map_1 } = globals;

	function add_css(target) {
		append_styles(target, "svelte-nd1yx3", ".route-builder.svelte-nd1yx3.svelte-nd1yx3{color:#f2f5f6;padding:0 12px 18px;font-family:inherit}.panel-kicker.svelte-nd1yx3.svelte-nd1yx3{display:flex;align-items:center;gap:7px;margin:2px 0 9px;color:#9ca6aa;font-size:10px;font-weight:700;letter-spacing:.12em}.status-dot.svelte-nd1yx3.svelte-nd1yx3{width:7px;height:7px;border-radius:50%;background:#00c9a7;box-shadow:0 0 8px #00c9a766}.forecast-launcher.svelte-nd1yx3.svelte-nd1yx3{display:flex;gap:7px;margin:0 0 10px}.forecast-launcher.svelte-nd1yx3 .forecast-button.svelte-nd1yx3{flex:1 1 0;min-width:0}.label-settings.svelte-nd1yx3.svelte-nd1yx3{margin:0 0 8px;border:1px solid #4e585b;border-radius:5px;background:#303638;color:#dce3e5}.label-settings.svelte-nd1yx3>summary.svelte-nd1yx3{padding:8px 10px;color:#edf1f2;cursor:pointer;font-size:11px;font-weight:650}.forecast-button.svelte-nd1yx3.svelte-nd1yx3{flex:0 0 auto;padding:6px 8px;border:1px solid #1689a6;border-radius:4px;background:#07566a;color:#f0fbfd;font:inherit;font-size:10px;cursor:pointer}.forecast-button.svelte-nd1yx3.svelte-nd1yx3:hover:not(:disabled){background:#08738d}.forecast-button.svelte-nd1yx3.svelte-nd1yx3:disabled{opacity:.55;cursor:default}.forecast-field-add-wrap{position:relative}.window-filter-button{min-height:23px;padding:2px 6px;border:1px solid #879496;border-radius:4px;background:#eef2f2;color:#405052;font:9px Arial,sans-serif;cursor:pointer;white-space:nowrap}.window-filter-button.is-active{border-color:#1689a6;background:#d8eef2;color:#07566a}.window-filter-button:disabled{opacity:.55;cursor:default}.forecast-field-add{display:grid;place-items:center;width:23px;height:23px;padding:0;border:1px solid #1689a6;border-radius:4px;background:#07566a;color:#f0fbfd;font:18px/1 Arial,sans-serif;cursor:pointer}.forecast-field-picker{position:fixed;z-index:2147483647;pointer-events:auto;display:grid;min-width:165px;max-width:calc(100vw - 16px);max-height:240px;overflow:auto;padding:4px;border:1px solid #899597;border-radius:4px;background:#f7f9f9;box-shadow:0 4px 12px #0004}.forecast-field-picker button{padding:6px 8px;border:0;background:transparent;color:#364144;text-align:left;font:10px Arial,sans-serif;cursor:pointer}.forecast-field-picker button:hover{background:#dcebed}.forecast-field-picker button.forecast-field-group{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:3px;padding:7px 8px;border-radius:3px;background:#e1eded;color:#28525a;font-weight:700}.forecast-field-picker .forecast-field-group small{color:#50696e;font:9px Arial,sans-serif}.forecast-field-picker button.forecast-field-group-item{padding-left:19px}.forecast-field-picker span{padding:6px 8px;color:#697477;font:10px Arial,sans-serif}.forecast-field-picker button.forecast-field-group,.forecast-field-picker button.forecast-field-select{display:flex;justify-content:flex-start;align-items:center;gap:6px;min-height:32px}.forecast-field-picker span.forecast-field-check{display:inline-block;flex:0 0 16px;padding:0;color:#087f95;font:17px/1 Arial,sans-serif}.forecast-field-picker button.forecast-field-commit{position:sticky;bottom:-4px;z-index:1;min-height:38px;margin:4px -4px -4px;padding:8px;border-radius:0 0 3px 3px;background:#087f95;color:#fff;text-align:center;font-weight:700}.forecast-field-picker button.forecast-field-commit:disabled{opacity:.55;cursor:default}.forecast-message.svelte-nd1yx3.svelte-nd1yx3{margin:7px 0 0;color:#a9dbe5;font-size:9px;line-height:1.4}.label-settings-grid.svelte-nd1yx3.svelte-nd1yx3{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 8px 8px}.label-setting-group.svelte-nd1yx3.svelte-nd1yx3{display:grid;grid-template-rows:auto auto minmax(0, 1fr);gap:6px;min-width:0;padding:7px;border:1px solid #465053;border-radius:4px}.label-setting-group.svelte-nd1yx3>strong.svelte-nd1yx3{margin-bottom:1px;color:#a9dbe5;font-size:10px;text-transform:uppercase;letter-spacing:.06em}.label-field-list.svelte-nd1yx3.svelte-nd1yx3{display:grid;gap:2px;min-width:0;padding:4px;border:1px solid #596467;border-radius:4px;background:#282e30}.label-field-list-heading.svelte-nd1yx3.svelte-nd1yx3,.label-field-row.svelte-nd1yx3.svelte-nd1yx3{display:grid;grid-template-columns:20px minmax(0, 1fr) 28px 28px;align-items:center;gap:1px}.label-field-list-heading.svelte-nd1yx3.svelte-nd1yx3{padding:2px 3px 4px;color:#91cddb;font-size:8px;font-weight:700;text-align:center;text-transform:uppercase}.label-field-list-heading.svelte-nd1yx3>span.svelte-nd1yx3:first-child{grid-column:1 / span 2;text-align:left}.label-field-row.svelte-nd1yx3.svelte-nd1yx3{min-height:30px;border-top:1px solid #3e484b;color:#dce3e5;font-size:9px;transition:background .12s ease, opacity .12s ease}.label-sort-handle.svelte-nd1yx3.svelte-nd1yx3{display:grid;place-items:center;width:20px;height:28px;padding:0;border:0;background:transparent;color:#91cddb;font-size:15px;line-height:1;cursor:grab;touch-action:none}.label-sort-handle.svelte-nd1yx3.svelte-nd1yx3:active{cursor:grabbing}.label-field-name.svelte-nd1yx3.svelte-nd1yx3{overflow-wrap:anywhere;min-width:0}.label-position-box.svelte-nd1yx3.svelte-nd1yx3{display:grid;place-items:center;min-height:28px;cursor:pointer}.label-position-box.svelte-nd1yx3 input.svelte-nd1yx3{width:15px;height:15px;margin:0;accent-color:#00a6d6;cursor:pointer}.label-font-size.svelte-nd1yx3.svelte-nd1yx3{display:grid;grid-template-columns:1fr auto;align-items:center;gap:3px 6px;color:#c7d0d2;font-size:10px}.label-font-size.svelte-nd1yx3 output.svelte-nd1yx3{color:#edf1f2;font-variant-numeric:tabular-nums}.label-font-size.svelte-nd1yx3 input.svelte-nd1yx3{grid-column:1 / -1;width:100%;margin:0;accent-color:#00a6d6;cursor:pointer}.label-unit.svelte-nd1yx3.svelte-nd1yx3{display:flex;align-items:center;justify-content:space-between;gap:5px;color:#c7d0d2;font-size:10px}.label-unit--stacked.svelte-nd1yx3.svelte-nd1yx3{display:grid;grid-template-columns:minmax(0, 1fr);gap:4px}.label-unit.svelte-nd1yx3 select.svelte-nd1yx3{max-width:75px;padding:3px 4px;border:1px solid #596467;border-radius:3px;background:#252b2d;color:#edf1f2;font:inherit}.label-unit.svelte-nd1yx3 .distance-font-select.svelte-nd1yx3{box-sizing:border-box;width:100%;max-width:none;padding:4px 20px 4px 6px;cursor:pointer}.size-picker.svelte-nd1yx3.svelte-nd1yx3{grid-column:1 / -1;display:grid;grid-template-columns:1fr auto;align-items:center;column-gap:10px;margin:0;color:#b4bdc0;font-size:11px}.size-picker.svelte-nd1yx3 input.svelte-nd1yx3{grid-column:1;width:100%;margin:5px 0 0;accent-color:#00a6d6;cursor:pointer}.size-picker.svelte-nd1yx3 output.svelte-nd1yx3{grid-column:2;grid-row:1 / span 2;min-width:36px;color:#edf1f2;font-variant-numeric:tabular-nums;text-align:right}.footnote.svelte-nd1yx3.svelte-nd1yx3{display:flex;gap:6px;margin-top:12px;color:#a1aaad;font-size:10px;line-height:1.45}.footnote.svelte-nd1yx3 span.svelte-nd1yx3{flex:0 0 auto;color:#67b9cb}.route-builder-marker-wrap{background:transparent;border:0;overflow:visible;pointer-events:auto !important;touch-action:none}.route-builder-marker{position:relative;isolation:isolate;display:grid;place-items:center;width:calc(var(--route-marker-size) + 13px);height:calc(var(--route-marker-size) + 13px);border:0;border-radius:50%;background:transparent;color:white;font:bold var(--route-marker-font-size) Arial,sans-serif;cursor:grab;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}.route-builder-marker:active{cursor:pointer}.route-builder-marker::before{content:'';position:absolute;inset:6.5px;border:1px solid #00a6d6;border-radius:50%;background:#00a6d6;box-shadow:0 1px 3px #0008;pointer-events:none;z-index:1}.route-builder-marker-number{position:absolute;inset:0;z-index:2;display:grid;place-items:center;line-height:1;text-align:center;pointer-events:none}.route-builder-marker-time{position:static;padding:0;background:transparent;color:#fff;font:var(--route-waypoint-label-font-size)/1.2 Arial,sans-serif;white-space:nowrap;text-shadow:0 1px 2px #000;pointer-events:none}.route-builder-marker-time-line{position:absolute;left:50%;z-index:2;display:flex;align-items:center;gap:3px;width:max-content;padding:2px 4px;border-radius:3px;background:#263236df;transform:translateX(-50%)}.route-builder-marker-time-line--above{top:-14px}.route-builder-marker-time-line--below{top:calc(var(--route-marker-size) + 8px)}.route-builder-marker-separator{opacity:.72}.route-builder-marker--start::before{border-color:#21a366;background:#21a366}.route-builder-marker--end::before{border-color:#cf5947;background:#cf5947}.route-builder-past-marker-wrap{background:transparent;border:0}.route-builder-past-marker{display:grid;place-items:center;box-sizing:border-box;width:var(--route-marker-size);height:var(--route-marker-size);margin:6.5px;border:1px solid #7b8588;border-radius:50%;background:#7b8588;box-shadow:0 1px 3px #0008;color:#fff;font:bold var(--route-marker-font-size) Arial,sans-serif;cursor:default;user-select:none}.route-builder-insert-preview-wrap{background:transparent;border:0}.route-builder-insert-preview{display:grid;place-items:center;width:22px;height:22px;border:1px solid #d8f7ff;border-radius:50%;background:#087e9d;box-shadow:0 1px 4px #0008;color:#fff;font:700 18px/1 Arial,sans-serif}.route-builder-distance-wrap{overflow:visible !important;border:0 !important;background:transparent !important}.route-builder-forecast-highlight-wrap{background:transparent;border:0}.route-builder-forecast-highlight{position:absolute;inset:3px;border:2px solid #fff;border-radius:50%;background:#ffffff55;box-shadow:0 0 0 5px #ffffff35, 0 1px 8px #15282caa}.route-builder-forecast-drawer-host{position:fixed;z-index:2147483647;bottom:0;max-height:70vh;pointer-events:none}.route-builder-forecast-drawer-host[hidden]{display:none !important}.forecast-drawer{position:relative;display:flex;flex-direction:column;gap:2px;width:100%;height:55vh;min-width:min(360px, 100%);min-height:320px;max-width:100%;max-height:70vh;overflow:visible;resize:none;box-sizing:border-box;padding:0 5px 10px;border:1px solid #555f62;border-top:0;border-radius:0;background:#f4f6f6fa;box-shadow:0 3px 16px #12242c66;color:#30383a;pointer-events:auto}.route-builder-forecast-drawer-host{max-height:70vh}.route-builder-forecast-drawer-host .forecast-drawer{height:auto;min-height:0;max-height:70vh}.route-builder-forecast-drawer-host .forecast-drawer{padding:0 5px 10px}.route-builder-forecast-drawer-host .forecast-drawer-header{position:absolute;top:0;left:0;right:0;z-index:2}.route-builder-forecast-drawer-host .forecast-table-scroll{width:100%;height:auto;max-height:calc(70vh - 160px);flex:0 1 auto;margin:0;box-sizing:border-box;overflow-y:auto}.route-forecast-settings{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:7px 9px;border-bottom:1px solid #d1d9da;background:#e7eded}.forecast-weather-settings-menu{position:relative;display:inline-flex;align-items:center;flex:0 0 auto}.forecast-settings-toggle{display:inline-flex;align-items:center;gap:4px;min-height:24px;padding:4px 7px;border:1px solid #a5b1b3;border-radius:4px;background:#edf1f1;color:#465255;font:9px Arial,sans-serif;white-space:nowrap;cursor:pointer}.forecast-settings-toggle[aria-expanded=\"true\"]{border-color:#1385a0;background:#d8eef2;color:#07566a}.forecast-settings-backdrop{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;box-sizing:border-box;padding:12px;background:#16212688}.forecast-settings-backdrop[hidden]{display:none !important}.forecast-settings-dialog{width:min(420px, calc(100vw - 24px));max-height:min(80vh, calc(100dvh - 24px));overflow:auto;box-sizing:border-box;border:1px solid #b6c1c2;border-radius:9px;background:#f4f6f6;box-shadow:0 8px 26px #17252966}.forecast-settings-dialog > header{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:50px;box-sizing:border-box;padding:10px 12px;border-bottom:1px solid #d3dcdd;background:#f4f6f6;color:#354043;font:700 13px Arial,sans-serif}.forecast-settings-dialog > header button{display:grid;place-items:center;width:28px;height:28px;padding:0;border:1px solid #a5b1b3;border-radius:50%;background:#fff;color:#465255;font:21px/1 Arial,sans-serif;cursor:pointer}.forecast-settings-tabs{position:sticky;top:50px;z-index:4;display:flex;gap:6px;padding:10px 12px;border-bottom:1px solid #d3dcdd;background:#f4f6f6}.forecast-settings-tabs button{flex:1 1 0;min-width:0;min-height:38px;padding:4px 3px;border:1px solid #9aa7a9;border-radius:4px;background:#e7eded;color:#465255;font:600 10px Arial,sans-serif}.forecast-settings-tabs button[aria-pressed=\"true\"]{background:#087f95;border-color:#087f95;color:#fff}.forecast-settings-dialog .route-forecast-settings{display:grid;grid-template-columns:minmax(0,1fr);width:100%;min-width:0;box-sizing:border-box;gap:10px;padding:12px;border:0;background:transparent}.forecast-settings-dialog .route-forecast-settings label{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);width:100%;min-width:0;box-sizing:border-box;align-items:center;gap:10px;color:#465255;font-size:11px}.forecast-settings-dialog .route-forecast-settings select{width:100%;min-width:0;box-sizing:border-box;min-height:34px;padding:5px 7px;font-size:11px}.forecast-settings-dialog .nav-restore-route-setting{grid-template-columns:minmax(0,1fr) auto !important}.forecast-settings-dialog .nav-restore-route-setting input[type=\"checkbox\"]{width:18px;height:18px;margin:0;accent-color:#087f95}.forecast-settings-dialog .route-forecast-settings > small{color:#788587;font-size:10px}.forecast-settings-dialog input[type=\"color\"][data-layline-color]{box-sizing:border-box;width:52px;height:32px;padding:2px;justify-self:end;border:1px solid #abb8ba;border-radius:4px;background:#fff}.navigation-visual-aids-list input[type=\"number\"]{box-sizing:border-box;width:100%;min-height:38px;padding:5px 7px;border:1px solid #abb8ba;border-radius:3px;background:#fff;color:#354145;font:14px Arial,sans-serif}.forecast-settings-dialog .wind-degrees-setting,.forecast-settings-dialog .wind-rose-toggle{grid-template-columns:minmax(120px,1fr) auto}.wind-degrees-setting input[type=\"checkbox\"],.wind-rose-toggle input[type=\"checkbox\"]{width:18px;height:18px;margin:0;accent-color:#087f95}.navigation-visual-aids{border-top:1px solid #d3dcdd;padding-top:10px;color:#465255;font:11px Arial,sans-serif}.navigation-visual-aids summary{min-height:34px;display:flex;align-items:center;justify-content:space-between;font-weight:700;cursor:pointer;list-style:none}.navigation-visual-aids summary::-webkit-details-marker{display:none}.navigation-visual-aids summary::after{content:'▾';font-size:14px}.navigation-visual-aids[open] summary::after{content:'▴'}.navigation-visual-aids-list{display:grid;gap:10px;padding:4px 0 6px}.navigation-visual-aids-list small{color:#788587}.navigation-visual-group{padding:0 8px;border:1px solid #d3dcdd;border-radius:5px;background:#f8f9f9}.navigation-visual-group summary{display:flex;align-items:center;justify-content:space-between;min-height:36px;color:#465255;font-weight:700;cursor:pointer;list-style:none}.navigation-visual-group summary::-webkit-details-marker{display:none}.navigation-visual-group summary::after{content:'▾';font-size:14px}.navigation-visual-group[open] summary::after{content:'▴'}.navigation-visual-group-body{display:grid;gap:10px;padding:0 0 10px}.navigation-visual-group-body > hr,.navigation-visual-group-body > strong{grid-column:1 / -1}.forecast-settings-dialog .forecast-drawer-height-setting{grid-template-columns:1fr auto !important}.forecast-settings-dialog .forecast-drawer-height-setting input{grid-column:1 / -1;width:100%;height:48px;margin:0;padding:0;background:transparent;cursor:pointer;-webkit-appearance:none;appearance:none}.forecast-settings-dialog .forecast-drawer-height-setting input::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:#aebcbf}.forecast-settings-dialog .forecast-drawer-height-setting input::-webkit-slider-thumb{-webkit-appearance:none;width:44px;height:44px;margin-top:-19px;border:7px solid transparent;border-radius:50%;background:#087f95;background-clip:padding-box;box-sizing:border-box;box-shadow:0 1px 4px #17252955}.forecast-settings-dialog .forecast-drawer-height-setting input::-moz-range-track{height:6px;border-radius:3px;background:#aebcbf}.forecast-settings-dialog .forecast-drawer-height-setting input::-moz-range-thumb{width:30px;height:30px;border:7px solid transparent;border-radius:50%;background:#087f95;background-clip:padding-box;box-sizing:content-box;box-shadow:0 1px 4px #17252955}.forecast-settings-dialog .forecast-drawer-height-setting input:focus-visible{outline:2px solid #087f95;outline-offset:2px}.forecast-drawer-height-setting span{color:#087f95;font-weight:700} .route-forecast-settings label{display:flex;flex-direction:column;gap:3px;min-width:0;color:#526166;font:10px Arial,sans-serif} .route-forecast-settings select{width:100%;min-width:0;padding:4px;border:1px solid #abb8ba;border-radius:3px;background:#fff;color:#354145;font:10px Arial,sans-serif}.route-forecast-settings{flex:0 1 426px;grid-template-columns:repeat(3,minmax(0,1fr));width:min(426px,100%);min-width:0;gap:4px;padding:0;border:0;background:transparent}.route-forecast-settings label{font-size:9px}.route-forecast-settings select{padding:3px;font-size:9px}body.onwindy-plugin-navigator [data-plugin=\"bottom-right\"],body.onwindy-plugin-navigator [data-plugin=\"bottom-controls-mobile\"],body.onwindy-plugin-navigator [data-plugin=\"bottom-below-controls-mobile\"],body.onwindy-plugin-navigator [data-plugin=\"mobile-ui\"],body.route-builder-fullscreen [data-plugin=\"bottom-right\"],body.route-builder-fullscreen [data-plugin=\"bottom-controls-mobile\"],body.route-builder-fullscreen [data-plugin=\"bottom-below-controls-mobile\"],body.route-builder-fullscreen [data-plugin=\"mobile-ui\"]{display:none !important}body.route-builder-forecast-open #windy .leaflet-top.leaflet-right,body.route-builder-forecast-open .leaflet-top.leaflet-right{display:none !important}body.route-builder-forecast-open #logo-wrapper,body.route-builder-forecast-open #search,body.route-builder-forecast-open #mobile-ovr-select,body.route-builder-forecast-open #embed-zoom{display:none !important}body.route-builder-fullscreen .rhpane,body.route-builder-fullscreen .plugin-rhpane{display:none !important}body.route-builder-fullscreen > section:first-of-type{transform:none !important;width:100vw !important}body.route-builder-fullscreen .route-builder-forecast-drawer-host{left:0 !important;right:0 !important}.route-builder-reopen-button{position:fixed;left:16px;bottom:calc(64px + env(safe-area-inset-bottom, 0px));z-index:2147483647;padding:8px 12px;border:1px solid #1689a6;border-radius:5px;background:#07566a;color:#fff;font:12px Arial,sans-serif;cursor:pointer;box-shadow:0 2px 8px #0005}.route-builder-reopen-button[hidden]{display:none !important}.forecast-drawer-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-right:38px;color:#3c4446}.forecast-drawer-header > div{display:flex;flex-direction:column;gap:2px}.forecast-drawer-header strong{font-size:12px}.forecast-drawer-header small{color:#687174;font-size:9px}.forecast-drawer-header-actions{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto}.route-waypoint-dialog-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:max(16px, env(safe-area-inset-top, 0px)) 16px max(64px, calc(16px + env(safe-area-inset-bottom, 0px)));background:#0009}.route-waypoint-dialog{box-sizing:border-box;width:min(100%, 360px);padding:20px;border-radius:8px;background:#f1f4f4;color:#344044;box-shadow:0 4px 20px #0005;font:14px Arial,sans-serif}.route-waypoint-dialog h3{margin:0 0 16px;font-size:19px}.route-waypoint-dialog label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0}.route-waypoint-dialog input{box-sizing:border-box;width:60%;padding:8px;border:1px solid #9aa7a9;border-radius:4px;font:inherit}.route-waypoint-dialog > div{display:flex;justify-content:space-between;gap:6px;margin-top:16px}.route-waypoint-dialog button{padding:8px;border:1px solid #9aa7a9;border-radius:4px;background:#e7eded;color:#344044;font:inherit;cursor:pointer}.route-waypoint-dialog{max-height:100%;overflow-y:auto}.route-waypoint-dialog > .coordinate-editors{display:block;margin:12px 0}.route-waypoint-dialog .coordinate-mode{width:100%;color:#066c7b}.coordinate-section{margin:10px 0}.coordinate-section > strong{display:block;margin-bottom:6px}.coordinate-columns{display:flex;gap:4px}.coordinate-column{flex:1 1 0;min-width:0;text-align:center}.coordinate-column > span{display:block;font-size:10px;overflow:hidden;text-overflow:ellipsis}.coordinate-fraction{flex:2 1 0;min-width:0;text-align:center}.coordinate-fraction > span{display:block;font-size:10px}.coordinate-fraction-wheels{display:flex;gap:2px}.coordinate-wheel{height:96px;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;scroll-snap-type:y mandatory;scrollbar-width:none;border:1px solid #bdc9c9;border-radius:5px;padding:32px 0;background:linear-gradient(to bottom, #e4eaea 0 33.33%, #b8dddd 33.33% 66.66%, #e4eaea 66.66%);touch-action:pan-y}.coordinate-wheel::-webkit-scrollbar{display:none}.coordinate-wheel > div{box-sizing:border-box;height:32px;line-height:32px;scroll-snap-align:center;color:#23494b;font-size:16px}.coordinate-preview{margin-top:5px;text-align:center;font-size:12px;color:#416264}.route-waypoint-dialog > .coordinate-actions{display:flex;margin-top:12px}.route-waypoint-error{color:#a32121}.forecast-drawer-bottom-bar{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:stretch;gap:5px;flex:0 0 auto;width:100%;margin-top:auto;padding-top:2px;border-top:1px solid #d0d8d9}.route-builder-forecast-drawer-host .forecast-drawer-bottom-bar{grid-template-columns:30px repeat(6,minmax(0,1fr));gap:3px}.forecast-saved-routes{grid-column:1 / -1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.route-builder-forecast-drawer-host .forecast-saved-routes{display:contents}.forecast-bottom-add-field{display:grid;place-items:center;min-width:0}.forecast-bottom-add-field .forecast-field-add{width:30px;height:32px;font-size:22px}.forecast-bottom-action,.forecast-drawer-bottom-bar .forecast-settings-toggle{display:flex;align-items:center;justify-content:center;width:100%;min-width:0;min-height:32px;box-sizing:border-box;padding:4px 5px;border:1px solid #9aa7a9;border-radius:4px;background:#e7eded;color:#465255;font:9px Arial,sans-serif;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}.forecast-bottom-action[aria-expanded=\"true\"],.forecast-drawer-bottom-bar .forecast-settings-toggle[aria-expanded=\"true\"]{border-color:#1385a0;background:#d8eef2;color:#07566a}.forecast-saved-routes .route-snapshot-saved{border-color:#16764f;background:#178653;color:#fff;font-weight:600;touch-action:manipulation;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}.forecast-saved-routes .route-snapshot-saved:active{background:#116d43}.forecast-bottom-action:disabled{opacity:.48;cursor:default}.forecast-bottom-speed{flex-direction:column;gap:1px;padding:2px;cursor:default}.forecast-bottom-speed > span:first-child{font-size:8px;line-height:1}.forecast-bottom-speed .forecast-departure-speed-input{width:58px;max-width:100%;height:17px;flex:0 1 auto;padding:0 3px}.forecast-bottom-speed .forecast-departure-speed-input input{font-size:9px}.forecast-bottom-speed .forecast-departure-speed-input small{font-size:8px}.route-builder-forecast-drawer-host .forecast-drawer-bottom-bar > .forecast-bottom-action,.route-builder-forecast-drawer-host .forecast-drawer-bottom-bar > .forecast-weather-settings-menu .forecast-settings-toggle,.route-builder-forecast-drawer-host .forecast-saved-routes > .forecast-bottom-action{min-height:32px;padding:2px 1px;font-size:8px}.route-builder-forecast-drawer-host .forecast-bottom-speed{gap:2px;padding:2px 1px}.route-builder-forecast-drawer-host .forecast-bottom-speed > span:first-child{font-size:7px}.route-builder-forecast-drawer-host .forecast-bottom-speed .forecast-departure-speed-input{width:100%;max-width:54px;height:17px;padding:0 2px}.route-builder-forecast-drawer-host .forecast-bottom-speed .forecast-departure-speed-input input{min-width:0;font-size:8px}.route-builder-forecast-drawer-host .forecast-bottom-speed .forecast-departure-speed-input small{font-size:7px}.forecast-drawer-bottom-bar .forecast-weather-settings-menu{display:block;width:100%;min-width:0}.forecast-drawer-bottom-bar .forecast-settings-toggle{font-size:9px}.forecast-drawer-bottom-bar .forecast-settings-toggle{flex-direction:column;gap:1px;line-height:1.05}.forecast-drawer-bottom-bar .forecast-settings-toggle .forecast-version{font:7px/1 Arial,sans-serif;opacity:.78}.forecast-settings-map-tab{padding:8px 12px 12px}.label-settings--settings-tab{position:static;display:block;width:auto;max-height:none;overflow:visible;margin:0;transform:none;box-shadow:none}.label-settings--settings-tab > summary{display:none}.label-settings--settings-tab{border:0;border-radius:0;background:transparent;color:#465255}.label-settings--settings-tab .label-settings-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;padding:0}.label-settings--settings-tab .label-setting-group{padding:8px;border-color:#d3dcdd;border-radius:5px;background:#f8f9f9}.label-settings--settings-tab .label-setting-group > strong{color:#087f95}.label-settings--settings-tab .label-field-list{border-color:#d3dcdd;background:#fff}.label-settings--settings-tab .label-field-list-heading{color:#617477}.label-settings--settings-tab .label-field-row{border-top-color:#e1e6e7;color:#465255}.label-settings--settings-tab .label-sort-handle{color:#708386}.label-settings--settings-tab .label-position-box input{accent-color:#087f95}.label-settings--settings-tab .label-font-size,.label-settings--settings-tab .label-unit{color:#465255}.label-settings--settings-tab .label-font-size output{color:#354043}.label-settings--settings-tab .label-font-size input{accent-color:#087f95}.label-settings--settings-tab .label-font-size input{height:32px;appearance:none;background:transparent}.label-settings--settings-tab .label-font-size input::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:#aebcbf}.label-settings--settings-tab .label-font-size input::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;margin-top:-7px;border:0;border-radius:50%;background:#087f95;box-shadow:0 1px 4px #17252955}.label-settings--settings-tab .label-font-size input::-moz-range-track{height:4px;border-radius:2px;background:#aebcbf}.label-settings--settings-tab .label-font-size input::-moz-range-thumb{width:18px;height:18px;border:0;border-radius:50%;background:#087f95;box-shadow:0 1px 4px #17252955}.label-settings--settings-tab .label-unit select{border-color:#abb8ba;background:#fff;color:#354043}.label-settings--settings-tab .label-unit .distance-font-select{min-height:34px}.label-settings--settings-tab .label-sort-handle:focus-visible,.label-settings--settings-tab input:focus-visible,.label-settings--settings-tab select:focus-visible{outline:2px solid #087f95;outline-offset:2px}.forecast-settings-map-tab .label-settings--settings-tab{background:transparent !important;border:0 !important;color:#465255 !important}.forecast-settings-map-tab .label-settings--settings-tab .label-settings-grid{gap:8px;padding:0}.forecast-settings-map-tab .label-settings--settings-tab .label-setting-group{align-content:start;grid-template-rows:auto auto auto;gap:7px;padding:8px;border:1px solid #d4dddd;background:#fff}.forecast-settings-map-tab .label-settings--settings-tab .label-setting-group > strong{color:#087f95;font-size:10px}.forecast-settings-map-tab .label-settings--settings-tab .label-field-list{padding:4px;border:1px solid #d5dede;background:#f6f8f8}.forecast-settings-map-tab .label-settings--settings-tab .label-field-list-heading{color:#536c70;font-size:8px}.forecast-settings-map-tab .label-settings--settings-tab .label-field-row{min-height:32px;border-top-color:#dce4e4;color:#354346}.forecast-settings-map-tab .label-settings--settings-tab .label-sort-handle{color:#678c91}.forecast-settings-map-tab .label-settings--settings-tab .label-font-size,.forecast-settings-map-tab .label-settings--settings-tab .label-unit,.forecast-settings-map-tab .label-settings--settings-tab .size-picker{color:#465255}.forecast-settings-map-tab .label-settings--settings-tab .label-font-size output,.forecast-settings-map-tab .label-settings--settings-tab .size-picker output{color:#354043}.forecast-settings-map-tab .label-settings--settings-tab .label-unit select{background:#fff;border-color:#abb8ba;color:#354043;color-scheme:light}.forecast-settings-map-tab .label-settings--settings-tab .size-picker input{accent-color:#087f95}.forecast-route-statistics{flex:0 0 auto;border:1px solid #c5cfd0;border-radius:4px;background:#e9eeee;color:#3d494b}.forecast-route-statistics > summary{padding:5px 8px;cursor:pointer;font:700 10px Arial,sans-serif}.forecast-route-statistics-content{display:flex;align-items:center;gap:12px;padding:0 8px 7px;color:#536164;font:9px Arial,sans-serif}.forecast-route-statistics-content strong{color:#26383c;font-size:16px;font-variant-numeric:tabular-nums}.forecast-route-statistics-content strong small{color:#536164;font-size:9px;font-weight:500}.forecast-drawer-close{position:absolute;top:8px;right:8px;z-index:2;display:grid;place-items:center;width:32px;height:32px;padding:0;border:1px solid #8b0000;border-radius:50%;background:#b00000;color:#fff;font:24px/1 Arial,sans-serif;cursor:pointer;box-shadow:0 1px 4px #0005}.forecast-departure-control{display:flex;flex-direction:column;gap:5px;flex:0 0 auto;padding:2px 2px 0;border:0;background:transparent}.forecast-departure-labels{display:flex;align-items:center;justify-content:space-between;gap:8px}.forecast-departure-labels > span{flex:0 0 auto;max-width:25%;padding:3px 7px;border-radius:4px;background:#c69b2d;color:#fff;font-size:10px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.forecast-departure-start-group{display:flex;align-items:center;gap:4px;flex:0 0 auto;max-width:none !important;padding:0 !important;background:transparent !important;overflow:visible !important}.forecast-departure-labels .forecast-departure-start{max-width:none;padding:3px 7px;border-radius:4px;background:#c69b2d;color:#fff;font-size:10px;font-weight:700;white-space:nowrap}.forecast-departure-step{display:inline-grid;place-items:center;width:22px;height:22px;flex:0 0 22px;padding:0;border:1px solid #a98224;border-radius:50%;background:#c69b2d;color:#fff;font:700 15px/1 Arial,sans-serif;cursor:pointer}.forecast-departure-step:hover:not(:disabled),.forecast-departure-step:focus-visible{border-color:#87691c;background:#ae8522;outline:2px solid #e8d69d;outline-offset:1px}.forecast-departure-step:disabled{opacity:.45;cursor:default}.forecast-valid-departure-controls{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto}.forecast-valid-departure-step{display:inline-grid;place-items:center;width:20px;height:22px;padding:0;border:1px solid #a98224;border-radius:4px;background:#c69b2d;color:#fff;font:700 14px/1 Arial,sans-serif;cursor:pointer}.forecast-valid-departure-step:hover:not(:disabled),.forecast-valid-departure-step:focus-visible{border-color:#87691c;background:#ae8522;outline:2px solid #e8d69d;outline-offset:1px}.forecast-valid-departure-step:disabled{opacity:.4;cursor:default}.forecast-departure-speed{display:inline-flex;align-items:center;gap:4px;flex:0 0 auto;color:#586366;font:9px Arial,sans-serif;white-space:nowrap}.forecast-departure-speed-input{display:inline-flex;align-items:center;width:65px;height:22px;padding:0 5px;border:1px solid #c3cbcd;border-radius:4px;background:#fff}.forecast-departure-speed-input input{box-sizing:border-box;width:100%;min-width:0;padding:0;border:0;outline:0;background:transparent;color:#354043;font:10px Arial,sans-serif;font-variant-numeric:tabular-nums}.forecast-departure-speed-input small{color:#687477;font:9px Arial,sans-serif}.route-analysis-ruler{position:absolute;z-index:1;top:-25px;left:0;right:0;height:16px;margin:0;border-bottom:1px solid #7e888a;pointer-events:none}.route-analysis-day-label{position:absolute;bottom:2px;padding:0 !important;border:0 !important;border-radius:0 !important;background:transparent !important;color:#50595b !important;font-size:8px;font-weight:400;white-space:nowrap;transform:translateX(-50%)}.route-analysis-track{position:relative;align-self:stretch;width:100%;flex:0 0 14px;min-width:44px;height:14px;margin:27px 0 0;border-radius:8px;background:#45484a}.route-analysis-grid{position:absolute;z-index:1;inset:0;pointer-events:none}.route-analysis-track span.route-analysis-division{position:absolute;top:1px;bottom:1px;width:1px !important;min-width:0 !important;max-width:none !important;height:auto;padding:0 !important;border:0 !important;border-radius:0 !important;background:#cbd2d4 !important;opacity:.32;transform:translateX(-.5px)}.route-analysis-track span.route-analysis-day-boundary{position:absolute;top:0;bottom:0;width:2px !important;min-width:0 !important;max-width:none !important;height:auto;padding:0 !important;border:0 !important;border-radius:0 !important;background:#f5f7f7 !important;opacity:.95;box-shadow:0 0 1px #192225;transform:translateX(-1px)}.route-analysis-track span.route-analysis-slot{position:absolute;z-index:2;top:4px;display:block;width:var(--departure-marker-size, 5px) !important;min-width:0 !important;max-width:none !important;height:var(--departure-marker-size, 5px) !important;padding:0 !important;border:0 !important;border-radius:50% !important;pointer-events:none}.route-analysis-track span.route-analysis-slot.is-pass{background:var(--departure-quality-color, #45c768) !important;border:1px solid #23463b !important;box-shadow:0 0 0 1px #ffffffb8}.route-analysis-track span.route-analysis-slot.is-optimal{z-index:4;box-shadow:0 0 0 2px #fff, 0 0 6px #18232699}.route-analysis-track span.route-analysis-slot.is-fail,.route-analysis-track span.route-analysis-slot.is-unknown{display:none !important}.forecast-departure-control{position:relative;gap:2px;padding:0;border:0;box-sizing:border-box}.route-builder-forecast-drawer-host .forecast-departure-control{margin-right:-5px;margin-left:-5px}.departure-timebar-frame{position:relative;width:100%;min-width:0}.departure-timebar-scroll{width:100%;min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;touch-action:pan-x}.departure-timebar-scroll{cursor:grab}.departure-timebar-scroll.is-dragging{cursor:grabbing}.departure-timebar-scroll::-webkit-scrollbar{display:none;width:0;height:0}.departure-timebar{position:relative;height:58px;box-sizing:border-box;user-select:none;-webkit-user-select:none}.departure-timebar-indicator{position:absolute;z-index:6;inset:0;pointer-events:none}.departure-timebar-callout{position:absolute;top:auto;bottom:calc(100% + 1px);left:50%;z-index:4;display:grid;gap:2px;width:max-content;max-width:min(310px, calc(100vw - 48px));overflow:hidden;padding:4px 8px;border-radius:5px;background:#c69b2d;color:#fff;font:700 9px/1.2 Arial,sans-serif;text-align:center;text-overflow:ellipsis;white-space:normal;box-shadow:0 1px 4px #0003;transform:translateX(-50%);pointer-events:none}.departure-timebar-callout{pointer-events:auto;cursor:ns-resize;touch-action:none;user-select:none;-webkit-user-select:none}.departure-timebar-callout small{font:700 8px/1.1 Arial,sans-serif;opacity:.95}.departure-timebar-callout-tail{position:absolute;top:-7px;left:50%;z-index:4;width:0;height:0;border-top:6px solid #c69b2d;border-right:6px solid transparent;border-left:6px solid transparent;transform:translateX(-50%)}.departure-timebar-days{position:absolute;top:0;left:0;right:0;height:21px}.departure-day-band{position:absolute;top:0;display:grid;place-items:center;height:21px;box-sizing:border-box;padding:0 3px;border-right:2px solid #697174;background:#45484a;color:#f1f3f3;font:700 12px Arial,sans-serif;white-space:nowrap;overflow:hidden}.departure-timebar-hours{position:absolute;top:22px;left:0;right:0;height:22px;background:#e1e5e5}.departure-hour-tick{position:absolute;top:0;display:flex;flex-direction:column;align-items:center;width:20px;color:#657073;font:10px/1 Arial,sans-serif;transform:translateX(-50%)}.departure-hour-tick i{display:block;width:1px;height:5px;margin-bottom:2px;background:#788184}.departure-timebar .route-analysis-track{position:absolute;top:44px;left:0;height:8px;min-width:0;margin:0;border-radius:0;background:#e1e5e5}.departure-timebar .route-analysis-grid{position:absolute;inset:0;pointer-events:none}.departure-timebar .route-analysis-slot{top:1px;height:6px;z-index:2}.departure-timebar .route-analysis-track span.route-analysis-slot.is-pass{background:var(--departure-quality-color, #1eaa51) !important}.departure-timebar-cursor{position:absolute;top:0;bottom:16px;left:50%;z-index:3;width:2px;background:#c69b2d;box-shadow:0 0 2px #fff;transform:translateX(-1px)}.departure-timebar-cursor::after{content:'';position:absolute;bottom:-12px;left:50%;box-sizing:border-box;width:12px;height:12px;border:2px solid #fff;border-radius:50%;background:#c69b2d;box-shadow:0 1px 4px #18232666;transform:translateX(-50%)}.forecast-departure-control.is-live .departure-timebar-scroll{overflow-x:hidden;touch-action:none;cursor:default}.forecast-departure-control.is-live .departure-timebar-callout,.forecast-departure-control.is-live .departure-timebar-cursor,.forecast-departure-control.is-live .departure-timebar-cursor::after{background:#188b67}.forecast-departure-control.is-live .departure-timebar-callout-tail{border-top-color:#188b67}.forecast-departure-control.is-live .departure-day-band{background:#286f59;border-right-color:#78a79a}.forecast-departure-control.is-live .departure-timebar-hours,.forecast-departure-control.is-live .route-analysis-track{background:#d5eade}.forecast-table-scroll{flex:1 1 auto;width:100%;max-width:100%;min-width:0;min-height:0;overflow-x:auto;overflow-y:auto;border:1px solid #c3cbcd;border-radius:3px;scrollbar-color:#899597 #dce1e2;scrollbar-width:thin}.forecast-table-scroll{scrollbar-width:none}.forecast-table-scroll::-webkit-scrollbar{display:none;width:0;height:0}.forecast-table-scroll td[data-forecast-index]{cursor:grab;user-select:none}.forecast-table-scroll.is-table-dragging td[data-forecast-index]{cursor:grabbing}.forecast-table{width:max-content;min-width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0;color:#454d4f;font:11px/1.25 Arial,sans-serif;font-variant-numeric:tabular-nums;text-align:center}.forecast-table th,.forecast-table td{box-sizing:border-box;padding:4px 5px;border-right:1px solid #d5dcdd;border-bottom:1px solid #d5dcdd;white-space:nowrap}.forecast-table .forecast-sample-head,.forecast-table tbody td[data-forecast-index]{padding:3px 2px}.forecast-table thead th{background:#d6dcdd;color:#354043}.forecast-table .forecast-row-label{position:sticky;left:0;z-index:1;background:#e5e9ea;color:#596365;text-align:left}.forecast-table thead .forecast-row-label{z-index:2;background:#d6dcdd}.forecast-table .forecast-row-label{min-width:72px}.forecast-table tbody tr.forecast-field-row th,.forecast-table tbody tr.forecast-field-row td{padding-top:2px;padding-bottom:2px}.forecast-table tbody .forecast-row-label{height:28px;max-height:28px;overflow:hidden}.forecast-table .forecast-stat-heading{text-align:left}.forecast-table .forecast-stat-cell{padding:4px 3px;background:#e5e9ea;white-space:normal;vertical-align:middle}.forecast-table .forecast-stat-cell small,.forecast-table .forecast-stat-cell b{display:block}.forecast-table .forecast-stat-cell small{margin-bottom:1px;color:#738083;font-size:8px;line-height:1}.forecast-table .forecast-stat-cell b{color:#3e484a;font-size:10px;line-height:1;overflow-wrap:anywhere}.forecast-condition-row-label{display:flex;align-items:center;justify-content:space-between;gap:4px;width:100%}.forecast-field-meta{display:flex;flex:1 1 auto;min-width:0;flex-direction:column;align-items:flex-start;justify-content:center;gap:1px;overflow:hidden}.window-condition-row-label{display:flex;align-items:center;gap:4px;width:100%}.forecast-field-drag{display:inline-grid;place-items:center;width:24px;min-width:24px;height:20px;flex:0 0 24px;margin:-3px 0;color:#718083;font-size:15px;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}.forecast-field-name{display:block;flex:0 0 auto;min-width:42px;max-width:100%;overflow:hidden;color:inherit;font-size:9px;line-height:1.05;text-overflow:ellipsis;white-space:nowrap}.forecast-model-badge{display:inline-flex;align-items:center;max-width:100%;flex:0 0 auto;padding:1px 3px;border-radius:3px;font:700 7px/1 Arial,sans-serif;white-space:nowrap}.forecast-model-badge.is-gfs{background:#fff0c2;color:#946300}.forecast-model-badge.is-gfs-waves{background:#dcecf2;color:#24677c}.forecast-model-badge.is-ecmwf{background:#eadcf5;color:#63328a}.forecast-model-badge.is-ecmwf-waves{background:#f3dce9;color:#8a315b}.forecast-model-badge.is-mblue{background:#dcefe9;color:#236b55}.forecast-model-badge.is-icon{background:#e1e8fb;color:#354d9b}.forecast-model-badge.is-arome{background:#fae6d6;color:#9a5420}.forecast-model-badge.is-cmems{background:#d9eafb;color:#245b8a}.window-condition-open{display:inline-grid;place-items:center;width:19px;height:19px;flex:0 0 19px;padding:0;border:1px solid #9ca9ab;border-radius:50%;background:#f7f9f9;color:#596568;font:13px/1 Arial,sans-serif;cursor:pointer}.window-condition-open:hover,.window-condition-open:focus-visible{border-color:#078caf;color:#007d9e;outline:none}.window-condition-open.is-configured{border-color:#078caf;background:#d8f4fa;color:#006b87}.window-condition-open.is-pass{border-color:#22974b;background:#d8f3df;color:#16843c}.window-condition-open.is-fail{border-color:#c74337;background:#f8deda;color:#b72f25}.forecast-wind-group-toggle{display:inline-grid;place-items:center;width:19px;height:19px;flex:0 0 19px;padding:0;border:1px solid #9ca9ab;border-radius:50%;background:#f7f9f9;color:#596568;font:12px/1 Arial,sans-serif;cursor:pointer}.forecast-wind-group-toggle[aria-expanded=\"true\"]{border-color:#078caf;background:#d8eef2;color:#07566a}.forecast-model-badge.is-wind-average{color:#07566a;background:#d7eef2}.forecast-field-remove{display:inline-grid;place-items:center;width:17px;height:19px;flex:0 0 17px;padding:0;border:1px solid #bd7769;border-radius:3px;background:transparent;color:#a54a3c;font:15px/1 Arial,sans-serif;cursor:pointer}.forecast-field-remove:hover{background:#f7dfda}.forecast-field-row{cursor:grab}.forecast-table tr.forecast-wind-model-detail > .forecast-row-label{padding-left:15px !important}.forecast-field-row.is-dragging{opacity:.45}.forecast-field-row.is-drop-target{outline:2px dashed #078caf;outline-offset:-2px}.window-condition-backdrop{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:12px;background:#16212688}.direction-wheel-box{display:grid;justify-items:center;gap:6px;margin:8px 0}.direction-wheel{width:190px;height:190px;position:relative;border-radius:50%;overflow:hidden;background:#778387}.direction-sector{position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;background:#c6d0d1;color:#263238;cursor:pointer}.direction-sector.is-selected{background:#56bfd0;color:#102d31}.direction-sector span{position:absolute;transform:translate(-50%, -50%);font:bold 13px Arial,sans-serif;pointer-events:none}.direction-sector:focus-visible{outline:3px solid #ffbc42;outline-offset:-4px}.arrival-hours-grid{display:grid;grid-template-columns:repeat(6, minmax(0, 1fr));gap:4px}.arrival-days-grid{display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));gap:4px}.window-condition-dialog .arrival-choice{min-width:0;min-height:36px;padding:4px 1px;border:1px solid #69777a;border-radius:4px;background:#252b2d;color:#edf1f2;font:10px Arial,sans-serif;cursor:pointer}.window-condition-dialog .arrival-choice.is-selected{border-color:#28aa6c;background:#146347;color:#fff}.window-condition-dialog .arrival-day-preset{justify-self:start;min-height:32px}.window-condition-dialog{box-sizing:border-box;width:min(360px, 100%);max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow-x:hidden;overflow-y:auto;border:1px solid #536064;border-radius:7px;background:#343b3e;color:#edf1f2;box-shadow:0 8px 28px #0008}.window-condition-dialog > header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;border-bottom:1px solid #4e585b;font-size:12px}.window-condition-dialog > header button{width:23px;height:23px;border:1px solid #687477;border-radius:50%;background:#252b2d;color:#e8eeee;font:18px/1 Arial,sans-serif;cursor:pointer}.window-condition-dialog .condition-content{display:grid;gap:8px;padding:10px;color:#dce3e5;font:10px Arial,sans-serif}.window-condition-dialog .condition-range{display:grid;grid-template-columns:1fr 1fr;gap:8px}.window-condition-dialog .condition-range label{display:flex;align-items:center;gap:4px;min-width:0;color:#bac4c6}.window-condition-dialog .condition-range select,.window-condition-dialog .condition-range input[type=\"time\"]{box-sizing:border-box;width:100%;min-width:0;padding:6px;border:1px solid #596467;border-radius:3px;background:#252b2d;color:#edf1f2;font:inherit}.sky-state-options{display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:5px}.sky-state-toggle{display:flex;align-items:center;gap:6px;min-width:0;padding:6px;border:1px solid #596467;border-radius:4px;background:#252b2d;color:#edf1f2;font-size:10px;cursor:pointer}.sky-state-toggle:has(input:checked){border-color:#27a967;background:#153a31}.sky-state-toggle input{width:15px;height:15px;margin:0;accent-color:#18a65b}.sky-state-toggle-icon{display:grid;place-items:center;width:24px;height:24px;flex:0 0 24px}.sky-state-toggle-icon .forecast-icon{width:24px;height:24px}.sky-state-emoji{font-size:19px;line-height:1}.condition-slider-summary{color:#e4e8e9;font-size:12px;font-weight:700}.condition-slider-control{position:relative;height:24px;margin:4px 8px 0;touch-action:none}.condition-slider-track,.condition-slider-fill{position:absolute;top:8px;height:8px;border-radius:8px}.condition-slider-track{left:9px;right:9px;background:#f7f8f7}.condition-slider-fill{background:#b58c42}.condition-slider-control input[type=\"range\"]{position:absolute;inset:0;width:100%;height:24px;margin:0;appearance:none;background:transparent;pointer-events:none}.condition-slider-control input[data-condition-slider=\"min\"]{z-index:2}.condition-slider-control input[data-condition-slider=\"max\"]{z-index:3}.condition-slider-control input[type=\"range\"]::-webkit-slider-runnable-track{height:8px;background:transparent}.condition-slider-control input[type=\"range\"]::-moz-range-track{height:8px;background:transparent}.condition-slider-control input[type=\"range\"]::-webkit-slider-thumb{width:18px;height:18px;margin-top:-5px;appearance:none;border:0;border-radius:50%;background:#c49a3c;box-shadow:0 1px 4px #0008;cursor:grab;pointer-events:auto}.condition-slider-control input[type=\"range\"]::-moz-range-thumb{width:18px;height:18px;border:0;border-radius:50%;background:#c49a3c;box-shadow:0 1px 4px #0008;cursor:grab;pointer-events:auto}.condition-slider-control input[type=\"range\"]:active::-webkit-slider-thumb,.condition-slider-control input[type=\"range\"]:active::-moz-range-thumb{cursor:grabbing}.condition-slider-ticks{display:flex;justify-content:space-between;margin:0 8px;color:#aab5b7;font-size:9px}.window-condition-dialog small{color:#aab5b7;line-height:1.4}.window-condition-dialog > footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 10px 10px}.condition-clear-button{padding:6px 8px;border:1px solid #687477;border-radius:4px;background:#303638;color:#d5dddf;font:10px Arial,sans-serif;cursor:pointer}.condition-clear-button:hover{border-color:#98a5a8;background:#41494c}.forecast-sample-head{position:relative}.forecast-table td[data-column-index]{position:relative}.forecast-column-resize-handle{position:absolute;top:0;right:-5px;z-index:5;display:block;width:10px;height:100%;min-width:0;padding:0;border:0;background:transparent;cursor:col-resize;touch-action:none}.forecast-column-resize-handle[data-resize-column]:not([data-resize-column=\"0\"]){display:none !important}.route-builder-gps-label-button{position:absolute;z-index:2147483646;top:-52px;right:8px;width:42px;min-width:42px;height:42px;padding:0;border:1px solid #fff;border-radius:50%;background:#087bd1;color:#fff;font:700 14px/1 Arial,sans-serif;box-shadow:0 2px 7px #14252c88;cursor:default;pointer-events:auto;touch-action:manipulation}.route-builder-gps-label-button[aria-pressed=\"true\"]{background:#188b67}.route-builder-gps-label-button svg{vertical-align:middle}.route-builder-live-button{left:8px;right:auto}.route-builder-live-button[hidden]{display:none}.route-builder-center-button{top:-100px;width:42px;min-width:42px;padding:0;display:grid;place-items:center}.route-builder-center-button[hidden]{display:none}.route-builder-zoom-button{font-size:27px;font-weight:400}.route-builder-zoom-in{top:-216px}.route-builder-zoom-out{top:-164px}.route-builder-gps-position-icon span{display:block;box-sizing:border-box;width:22px;height:22px;border:3px solid #fff;border-radius:50%;background:#087bd1;box-shadow:0 1px 8px #102b3b99}.route-wind-indicator{position:absolute;z-index:650;width:var(--wind-indicator-size, 26px);height:var(--wind-indicator-height, 30px);transform:translate(-50%, -50%);pointer-events:none}.route-wind-rose{position:absolute;z-index:640;transform:translate(-50%, -50%);pointer-events:none}.route-wind-rose[hidden]{display:none}.route-heading-degrees{position:absolute;z-index:645;display:grid;place-items:center;box-sizing:border-box;transform:translate(-50%, -50%);overflow:hidden;border:2px solid #202426;border-radius:6px;background:#f7f7f2;color:#202426;font-family:Arial,sans-serif;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap;box-shadow:0 1px 3px #17252988;pointer-events:none}.route-heading-degrees[hidden]{display:none}.route-wind-indicator[hidden]{display:none}.route-wind-indicator svg{position:absolute;inset:0;width:100%;height:100%}.route-wind-indicator span{position:absolute;inset:0;display:grid;place-items:center;padding-bottom:var(--wind-indicator-padding, 5px);box-sizing:border-box;color:#fff;font:bold var(--wind-indicator-text-size, 12px) Arial,sans-serif;text-shadow:0 1px 2px #003a68}.route-wave-indicator span{color:#202426;text-shadow:0 1px 1px #fff8}.route-wind-indicator .route-wind-degrees{position:absolute;top:50%;left:50%;padding:1px 3px;border-radius:3px;background:#263238cc;color:#fff;font:700 10px/1.2 Arial,sans-serif;white-space:nowrap;text-shadow:0 1px 1px #000}.route-wind-indicator .route-wind-degrees[hidden]{display:none}.route-navigation-dashboard{position:fixed;z-index:2147483000;top:max(8px, env(safe-area-inset-top));left:50%;transform:translateX(-50%);box-sizing:border-box;display:grid;grid-template-columns:24px minmax(0,1fr) minmax(0,1.08fr) minmax(0,1fr) 14px;width:min(520px, calc(100vw - 12px));min-height:92px;padding:3px 2px;border:1px solid #aab5b8;border-radius:10px;background:#edf0f0f5;color:#343c3e;box-shadow:0 2px 7px #14252c66;font-family:Arial,sans-serif}.route-navigation-dashboard[hidden]{display:none}.route-nav-side-label{writing-mode:vertical-rl;transform:rotate(180deg);align-self:center;justify-self:center;font-size:9px;font-weight:700;color:#566467;white-space:nowrap}.route-nav-waypoint-picker{position:relative;display:grid;place-items:center;cursor:pointer}.route-nav-waypoint-picker select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.route-nav-side{display:grid;grid-template-rows:repeat(3,1fr);min-width:0}.route-nav-side div{display:flex;align-items:center;justify-content:center;text-align:center;gap:4px;min-width:0;padding:0 2px;border-bottom:1px solid #cbd3d4;color:#378c82;font-size:13px}.route-nav-side div:last-child{border-bottom:0}.route-nav-side b{min-width:0;color:#343c3e;white-space:nowrap;font-size:clamp(10px, 3vw, 15px)}.route-nav-center{display:flex;flex-direction:column;align-items:stretch;text-align:center}.route-nav-speed{display:flex;flex:1;flex-direction:column;justify-content:center;align-items:center;border:1px solid #839195;border-radius:7px;line-height:1}.route-nav-speed-current{display:flex;justify-content:center;align-items:center;gap:2px;font-size:clamp(25px, 8vw, 42px);font-weight:bold}.route-nav-speed-average{padding:2px 0 3px;color:#566467;font-size:10px;white-space:nowrap}.route-nav-speed small{align-self:flex-start;padding-top:8px;font-size:10px}.route-nav-heading{padding:2px 0;font-size:clamp(20px, 5.8vw, 30px);font-weight:bold;line-height:1}.forecast-column-resize-handle:hover,.forecast-column-resize-handle:focus-visible{background:transparent;outline:none}body.forecast-column-resizing,body.forecast-column-resizing *{cursor:col-resize !important;user-select:none !important}.forecast-sample-head b,.forecast-sample-head small,.forecast-sample-head em{display:block}.forecast-sample-head b{color:#9d3426;font-size:8px}.forecast-sample-head small{margin-top:1px;color:#485254;font-size:7px;line-height:1.1}.forecast-date-time{display:grid;justify-items:center;gap:1px;line-height:1.1}.forecast-date-time small{color:#687477;font:8px/1.1 Arial,sans-serif}.forecast-date-time b{color:inherit;font:700 9px/1.1 Arial,sans-serif}.forecast-table tbody tr:nth-child(even) td{background:#e9eded}.forecast-table tr[data-route-field-row=\"rain\"] td[data-forecast-index],.forecast-table tr[data-route-field-row=\"ecmwfRain\"] td[data-forecast-index],.forecast-table tr[data-route-field-row=\"mblueRain\"] td[data-forecast-index],.forecast-table tr[data-route-field-row=\"iconRain\"] td[data-forecast-index],.forecast-table tr[data-route-field-row=\"aromeRain\"] td[data-forecast-index],.forecast-table tr[data-route-field-row=\"rainAverage\"] td[data-forecast-index]{background:#e9eded;color:#314ba9}.forecast-icon{display:inline-block;width:24px;height:24px;object-fit:contain;vertical-align:middle}.forecast-arrow{display:inline-block;margin-right:1px;color:#388d80;font-size:10px}.forecast-location-message{margin:-4px 0 0;color:#0874bf;font:9px/1.25 Arial,sans-serif}.forecast-location-message[hidden]{display:none}.forecast-table .route-waypoint-label,.forecast-table .route-waypoint-track{box-sizing:border-box;height:22px;padding:2px 3px;border-right:1px solid #727a7c;border-bottom:0;background:#45484a;color:#e9eded}.forecast-table .route-waypoint-label{padding-left:8px;text-align:left;font-size:9px;font-weight:600}.forecast-table .route-waypoint-track{position:relative;padding:0}.forecast-table .route-waypoint-dot{position:absolute;top:50%;display:inline-grid;place-items:center;width:13px;height:13px;border:1px solid #fff;border-radius:50%;color:#fff;font:700 8px/1 Arial,sans-serif;box-shadow:0 0 2px #0008;transform:translate(-50%, -50%)}.forecast-table .route-waypoint-dot.is-start{background:#1da875}.forecast-table .route-waypoint-dot.is-intermediate{background:#078bab}.forecast-table .route-waypoint-dot.is-destination{background:#d75b4c}.forecast-table .route-waypoint-boat{position:absolute;z-index:2;top:50%;width:20px;height:20px;transform:translate(-50%, -50%);pointer-events:none;filter:drop-shadow(0 1px 2px #0009)}.forecast-table .route-waypoint-boat[hidden]{display:none}.forecast-table .route-waypoint-boat svg{display:block;width:100%;height:100%}.route-builder-segment-info{position:absolute;top:-12px;left:0;display:block;width:max-content;color:#fff;font:700 11px/20px Arial,sans-serif;text-align:center;white-space:nowrap;text-shadow:0 1px 3px #526575, 0 0 5px #526575;transform-origin:center}.route-builder-distance-label{position:absolute;top:10px;left:0;display:block;width:max-content;color:#fff;font-family:var(--route-distance-font, Roboto, Arial, sans-serif);font-size:12px;font-weight:700;font-style:normal;line-height:22px;text-align:center;white-space:nowrap;text-shadow:0 1px 3px #526575, 0 0 5px #526575;transform-origin:center}body.route-builder-forecast-open .route-builder-forecast-drawer-host{height:auto !important;max-height:var(--route-drawer-max-height-vh, 58vh) !important;max-height:var(--route-drawer-max-height-dvh, 58dvh) !important}body.route-builder-forecast-open .route-builder-forecast-drawer-host .forecast-drawer{height:auto !important;min-height:0 !important;max-height:var(--route-drawer-max-height-vh, 58vh) !important;max-height:var(--route-drawer-max-height-dvh, 58dvh) !important;overflow:visible}body.route-builder-forecast-open .route-builder-forecast-drawer-host.is-height-collapsed .forecast-drawer{overflow:hidden}body.route-builder-forecast-open .route-builder-forecast-drawer-host .forecast-table-scroll{min-height:0 !important;flex:0 1 auto !important;max-height:max(0px, calc(var(--route-drawer-max-height-vh, 58vh) - 160px)) !important;max-height:max(0px, calc(var(--route-drawer-max-height-dvh, 58dvh) - 160px)) !important;overflow-y:auto !important}@media(max-width: 767px){body.route-builder-forecast-open #plugin-windy-plugin-navigator{display:none !important}body.route-builder-forecast-open .plugin__content.route-builder,body.route-builder-forecast-open .plugin__mobile-header{display:none !important}body.route-builder-forecast-open .route-builder-forecast-drawer-host{position:fixed !important;inset:auto 0 0 0 !important;width:100vw !important;height:33.333vh !important;height:33.333dvh !important;max-width:none !important;max-height:33.333vh !important;max-height:33.333dvh !important}body.route-builder-forecast-open .forecast-drawer{width:100% !important;height:100% !important;min-width:0 !important;min-height:0 !important;max-height:100% !important;border-radius:12px 12px 0 0 !important;padding:0 5px 10px !important}body.route-builder-forecast-open .route-builder-forecast-drawer-host .forecast-drawer{border-radius:0 !important;padding:0 5px max(48px, calc(10px + env(safe-area-inset-bottom, 0px))) !important}body.route-builder-forecast-open .forecast-departure-labels{flex-wrap:wrap;justify-content:flex-start;gap:4px 6px}body.route-builder-forecast-open .route-forecast-settings{order:5;flex:1 1 100%;width:100%;max-width:none}body.route-builder-forecast-open .forecast-departure-end{order:6;flex:0 1 100%;max-width:none !important;text-align:right}body.route-builder-forecast-open .forecast-table-scroll{flex:1 1 auto !important;min-height:0 !important;max-height:none !important}body.route-builder-forecast-open .route-builder-forecast-drawer-host{height:auto !important;max-height:var(--route-drawer-max-height-vh, 58vh) !important;max-height:var(--route-drawer-max-height-dvh, 58dvh) !important}body.route-builder-forecast-open .route-builder-forecast-drawer-host .forecast-drawer{height:auto !important;min-height:0 !important;max-height:var(--route-drawer-max-height-vh, 58vh) !important;max-height:var(--route-drawer-max-height-dvh, 58dvh) !important}body.route-builder-forecast-open .route-builder-forecast-drawer-host .forecast-table-scroll{flex:0 1 auto !important;max-height:max(0px, calc(var(--route-drawer-max-height-vh, 58vh) - 160px)) !important;max-height:max(0px, calc(var(--route-drawer-max-height-dvh, 58dvh) - 160px)) !important;overflow-y:auto !important}}");
	}

	function get_each_context(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[307] = list[i];
		return child_ctx;
	}

	function get_each_context_1(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[307] = list[i];
		return child_ctx;
	}

	// (5594:4) {#if forecastMessage}
	function create_if_block(ctx) {
		let p;
		let t;

		return {
			c() {
				p = element("p");
				t = text(/*forecastMessage*/ ctx[2]);
				attr(p, "class", "forecast-message svelte-nd1yx3");
				attr(p, "aria-live", "polite");
			},
			m(target, anchor) {
				insert(target, p, anchor);
				append(p, t);
			},
			p(ctx, dirty) {
				if (dirty[0] & /*forecastMessage*/ 4) set_data(t, /*forecastMessage*/ ctx[2]);
			},
			d(detaching) {
				if (detaching) {
					detach(p);
				}
			}
		};
	}

	// (5606:20) {#each waypointLabelRows as row (row.field)}
	function create_each_block_1(key_1, ctx) {
		let div;
		let button;
		let t0;
		let button_aria_label_value;
		let t1;
		let span;
		let t2_value = /*fieldNames*/ ctx[12][/*row*/ ctx[307].field] + "";
		let t2;
		let t3;
		let label0;
		let input0;
		let input0_checked_value;
		let input0_aria_label_value;
		let t4;
		let label1;
		let input1;
		let input1_checked_value;
		let input1_aria_label_value;
		let t5;
		let div_data_label_field_value;
		let mounted;
		let dispose;

		function change_handler(...args) {
			return /*change_handler*/ ctx[36](/*row*/ ctx[307], ...args);
		}

		function change_handler_1(...args) {
			return /*change_handler_1*/ ctx[37](/*row*/ ctx[307], ...args);
		}

		return {
			key: key_1,
			first: null,
			c() {
				div = element("div");
				button = element("button");
				t0 = text("⠿");
				t1 = space();
				span = element("span");
				t2 = text(t2_value);
				t3 = space();
				label0 = element("label");
				input0 = element("input");
				t4 = space();
				label1 = element("label");
				input1 = element("input");
				t5 = space();
				attr(button, "type", "button");
				attr(button, "class", "label-sort-handle svelte-nd1yx3");
				attr(button, "aria-label", button_aria_label_value = `Ordenar ${/*fieldNames*/ ctx[12][/*row*/ ctx[307].field]}`);
				attr(button, "title", "Arrastra para ordenar");
				attr(span, "class", "label-field-name svelte-nd1yx3");
				attr(input0, "type", "checkbox");
				input0.checked = input0_checked_value = /*row*/ ctx[307].position === 'above';
				attr(input0, "aria-label", input0_aria_label_value = `${/*fieldNames*/ ctx[12][/*row*/ ctx[307].field]}, arriba de la línea`);
				attr(input0, "class", "svelte-nd1yx3");
				attr(label0, "class", "label-position-box svelte-nd1yx3");
				attr(input1, "type", "checkbox");
				input1.checked = input1_checked_value = /*row*/ ctx[307].position === 'below';
				attr(input1, "aria-label", input1_aria_label_value = `${/*fieldNames*/ ctx[12][/*row*/ ctx[307].field]}, abajo de la línea`);
				attr(input1, "class", "svelte-nd1yx3");
				attr(label1, "class", "label-position-box svelte-nd1yx3");
				attr(div, "class", "label-field-row svelte-nd1yx3");
				attr(div, "data-label-field", div_data_label_field_value = /*row*/ ctx[307].field);
				attr(div, "data-label-group", "waypoint");
				this.first = div;
			},
			m(target, anchor) {
				insert(target, div, anchor);
				append(div, button);
				append(button, t0);
				append(div, t1);
				append(div, span);
				append(span, t2);
				append(div, t3);
				append(div, label0);
				append(label0, input0);
				append(div, t4);
				append(div, label1);
				append(label1, input1);
				append(div, t5);

				if (!mounted) {
					dispose = [
						listen(input0, "change", change_handler),
						listen(input1, "change", change_handler_1)
					];

					mounted = true;
				}
			},
			p(new_ctx, dirty) {
				ctx = new_ctx;

				if (dirty[0] & /*waypointLabelRows*/ 256 && button_aria_label_value !== (button_aria_label_value = `Ordenar ${/*fieldNames*/ ctx[12][/*row*/ ctx[307].field]}`)) {
					attr(button, "aria-label", button_aria_label_value);
				}

				if (dirty[0] & /*waypointLabelRows*/ 256 && t2_value !== (t2_value = /*fieldNames*/ ctx[12][/*row*/ ctx[307].field] + "")) set_data(t2, t2_value);

				if (dirty[0] & /*waypointLabelRows*/ 256 && input0_checked_value !== (input0_checked_value = /*row*/ ctx[307].position === 'above')) {
					input0.checked = input0_checked_value;
				}

				if (dirty[0] & /*waypointLabelRows*/ 256 && input0_aria_label_value !== (input0_aria_label_value = `${/*fieldNames*/ ctx[12][/*row*/ ctx[307].field]}, arriba de la línea`)) {
					attr(input0, "aria-label", input0_aria_label_value);
				}

				if (dirty[0] & /*waypointLabelRows*/ 256 && input1_checked_value !== (input1_checked_value = /*row*/ ctx[307].position === 'below')) {
					input1.checked = input1_checked_value;
				}

				if (dirty[0] & /*waypointLabelRows*/ 256 && input1_aria_label_value !== (input1_aria_label_value = `${/*fieldNames*/ ctx[12][/*row*/ ctx[307].field]}, abajo de la línea`)) {
					attr(input1, "aria-label", input1_aria_label_value);
				}

				if (dirty[0] & /*waypointLabelRows*/ 256 && div_data_label_field_value !== (div_data_label_field_value = /*row*/ ctx[307].field)) {
					attr(div, "data-label-field", div_data_label_field_value);
				}
			},
			d(detaching) {
				if (detaching) {
					detach(div);
				}

				mounted = false;
				run_all(dispose);
			}
		};
	}

	// (5623:20) {#each segmentLabelRows as row (row.field)}
	function create_each_block(key_1, ctx) {
		let div;
		let button;
		let t0;
		let button_aria_label_value;
		let t1;
		let span;
		let t2_value = /*fieldNames*/ ctx[12][/*row*/ ctx[307].field] + "";
		let t2;
		let t3;
		let label0;
		let input0;
		let input0_checked_value;
		let input0_aria_label_value;
		let t4;
		let label1;
		let input1;
		let input1_checked_value;
		let input1_aria_label_value;
		let div_data_label_field_value;
		let mounted;
		let dispose;

		function change_handler_2(...args) {
			return /*change_handler_2*/ ctx[39](/*row*/ ctx[307], ...args);
		}

		function change_handler_3(...args) {
			return /*change_handler_3*/ ctx[40](/*row*/ ctx[307], ...args);
		}

		return {
			key: key_1,
			first: null,
			c() {
				div = element("div");
				button = element("button");
				t0 = text("⠿");
				t1 = space();
				span = element("span");
				t2 = text(t2_value);
				t3 = space();
				label0 = element("label");
				input0 = element("input");
				t4 = space();
				label1 = element("label");
				input1 = element("input");
				attr(button, "type", "button");
				attr(button, "class", "label-sort-handle svelte-nd1yx3");
				attr(button, "aria-label", button_aria_label_value = `Ordenar ${/*fieldNames*/ ctx[12][/*row*/ ctx[307].field]}`);
				attr(button, "title", "Arrastra para ordenar");
				attr(span, "class", "label-field-name svelte-nd1yx3");
				attr(input0, "type", "checkbox");
				input0.checked = input0_checked_value = /*row*/ ctx[307].position === 'above';
				attr(input0, "aria-label", input0_aria_label_value = `${/*fieldNames*/ ctx[12][/*row*/ ctx[307].field]}, arriba de la línea`);
				attr(input0, "class", "svelte-nd1yx3");
				attr(label0, "class", "label-position-box svelte-nd1yx3");
				attr(input1, "type", "checkbox");
				input1.checked = input1_checked_value = /*row*/ ctx[307].position === 'below';
				attr(input1, "aria-label", input1_aria_label_value = `${/*fieldNames*/ ctx[12][/*row*/ ctx[307].field]}, abajo de la línea`);
				attr(input1, "class", "svelte-nd1yx3");
				attr(label1, "class", "label-position-box svelte-nd1yx3");
				attr(div, "class", "label-field-row svelte-nd1yx3");
				attr(div, "data-label-field", div_data_label_field_value = /*row*/ ctx[307].field);
				attr(div, "data-label-group", "segment");
				this.first = div;
			},
			m(target, anchor) {
				insert(target, div, anchor);
				append(div, button);
				append(button, t0);
				append(div, t1);
				append(div, span);
				append(span, t2);
				append(div, t3);
				append(div, label0);
				append(label0, input0);
				append(div, t4);
				append(div, label1);
				append(label1, input1);

				if (!mounted) {
					dispose = [
						listen(input0, "change", change_handler_2),
						listen(input1, "change", change_handler_3)
					];

					mounted = true;
				}
			},
			p(new_ctx, dirty) {
				ctx = new_ctx;

				if (dirty[0] & /*segmentLabelRows*/ 512 && button_aria_label_value !== (button_aria_label_value = `Ordenar ${/*fieldNames*/ ctx[12][/*row*/ ctx[307].field]}`)) {
					attr(button, "aria-label", button_aria_label_value);
				}

				if (dirty[0] & /*segmentLabelRows*/ 512 && t2_value !== (t2_value = /*fieldNames*/ ctx[12][/*row*/ ctx[307].field] + "")) set_data(t2, t2_value);

				if (dirty[0] & /*segmentLabelRows*/ 512 && input0_checked_value !== (input0_checked_value = /*row*/ ctx[307].position === 'above')) {
					input0.checked = input0_checked_value;
				}

				if (dirty[0] & /*segmentLabelRows*/ 512 && input0_aria_label_value !== (input0_aria_label_value = `${/*fieldNames*/ ctx[12][/*row*/ ctx[307].field]}, arriba de la línea`)) {
					attr(input0, "aria-label", input0_aria_label_value);
				}

				if (dirty[0] & /*segmentLabelRows*/ 512 && input1_checked_value !== (input1_checked_value = /*row*/ ctx[307].position === 'below')) {
					input1.checked = input1_checked_value;
				}

				if (dirty[0] & /*segmentLabelRows*/ 512 && input1_aria_label_value !== (input1_aria_label_value = `${/*fieldNames*/ ctx[12][/*row*/ ctx[307].field]}, abajo de la línea`)) {
					attr(input1, "aria-label", input1_aria_label_value);
				}

				if (dirty[0] & /*segmentLabelRows*/ 512 && div_data_label_field_value !== (div_data_label_field_value = /*row*/ ctx[307].field)) {
					attr(div, "data-label-field", div_data_label_field_value);
				}
			},
			d(detaching) {
				if (detaching) {
					detach(div);
				}

				mounted = false;
				run_all(dispose);
			}
		};
	}

	function create_fragment(ctx) {
		let div0;
		let t1;
		let section;
		let div1;
		let t3;
		let div2;
		let t5;
		let div3;
		let button;

		let t6_value = (/*forecastBusy*/ ctx[1]
		? 'Calculando…'
		: 'Pronóstico de la ruta') + "";

		let t6;
		let button_disabled_value;
		let t7;
		let t8;
		let details;
		let summary;
		let t10;
		let div10;
		let div6;
		let strong0;
		let t12;
		let label0;
		let span2;
		let output0;
		let t14;
		let t15;
		let t16;
		let input0;
		let t17;
		let div5;
		let div4;
		let t21;
		let each_blocks_1 = [];
		let each0_lookup = new Map_1();
		let t22;
		let div9;
		let strong1;
		let t24;
		let label1;
		let span6;
		let output1;
		let t26;
		let t27;
		let t28;
		let input1;
		let t29;
		let div8;
		let div7;
		let t33;
		let each_blocks = [];
		let each1_lookup = new Map_1();
		let t34;
		let label2;
		let span10;
		let t36;
		let select0;
		let option0;
		let option1;
		let t39;
		let label3;
		let span11;
		let t41;
		let select1;
		let option2;
		let option3;
		let option4;
		let option5;
		let t46;
		let label4;
		let span12;
		let t48;
		let input2;
		let t49;
		let output2;
		let t50;
		let t51;
		let t52;
		let div11;
		let mounted;
		let dispose;
		let if_block = /*forecastMessage*/ ctx[2] && create_if_block(ctx);
		let each_value_1 = ensure_array_like(/*waypointLabelRows*/ ctx[8]);
		const get_key = ctx => /*row*/ ctx[307].field;

		for (let i = 0; i < each_value_1.length; i += 1) {
			let child_ctx = get_each_context_1(ctx, each_value_1, i);
			let key = get_key(child_ctx);
			each0_lookup.set(key, each_blocks_1[i] = create_each_block_1(key, child_ctx));
		}

		let each_value = ensure_array_like(/*segmentLabelRows*/ ctx[9]);
		const get_key_1 = ctx => /*row*/ ctx[307].field;

		for (let i = 0; i < each_value.length; i += 1) {
			let child_ctx = get_each_context(ctx, each_value, i);
			let key = get_key_1(child_ctx);
			each1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
		}

		return {
			c() {
				div0 = element("div");
				div0.textContent = `${/*pluginTitle*/ ctx[11]}`;
				t1 = space();
				section = element("section");
				div1 = element("div");
				div1.textContent = `${/*pluginTitle*/ ctx[11]}`;
				t3 = space();
				div2 = element("div");
				div2.innerHTML = `<span class="status-dot svelte-nd1yx3"></span><span>PLANIFICADOR DE RUTA</span>`;
				t5 = space();
				div3 = element("div");
				button = element("button");
				t6 = text(t6_value);
				t7 = space();
				if (if_block) if_block.c();
				t8 = space();
				details = element("details");
				summary = element("summary");
				summary.textContent = "Datos en el mapa";
				t10 = space();
				div10 = element("div");
				div6 = element("div");
				strong0 = element("strong");
				strong0.textContent = "Waypoint";
				t12 = space();
				label0 = element("label");
				span2 = element("span");
				span2.textContent = "Tamaño de letra";
				output0 = element("output");
				t14 = text(/*waypointLabelFontSize*/ ctx[6]);
				t15 = text("px");
				t16 = space();
				input0 = element("input");
				t17 = space();
				div5 = element("div");
				div4 = element("div");
				div4.innerHTML = `<span class="svelte-nd1yx3">Campo</span><span class="svelte-nd1yx3">Arriba</span><span class="svelte-nd1yx3">Abajo</span>`;
				t21 = space();

				for (let i = 0; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].c();
				}

				t22 = space();
				div9 = element("div");
				strong1 = element("strong");
				strong1.textContent = "Segmento";
				t24 = space();
				label1 = element("label");
				span6 = element("span");
				span6.textContent = "Tamaño de letra";
				output1 = element("output");
				t26 = text(/*segmentLabelFontSize*/ ctx[7]);
				t27 = text("px");
				t28 = space();
				input1 = element("input");
				t29 = space();
				div8 = element("div");
				div7 = element("div");
				div7.innerHTML = `<span class="svelte-nd1yx3">Campo</span><span class="svelte-nd1yx3">Arriba</span><span class="svelte-nd1yx3">Abajo</span>`;
				t33 = space();

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				t34 = space();
				label2 = element("label");
				span10 = element("span");
				span10.textContent = "Unidad de distancia";
				t36 = space();
				select0 = element("select");
				option0 = element("option");
				option0.textContent = "km";
				option1 = element("option");
				option1.textContent = "Nm";
				t39 = space();
				label3 = element("label");
				span11 = element("span");
				span11.textContent = "Fuente de distancia";
				t41 = space();
				select1 = element("select");
				option2 = element("option");
				option2.textContent = "Windy / sistema";
				option3 = element("option");
				option3.textContent = "Roboto";
				option4 = element("option");
				option4.textContent = "Arial";
				option5 = element("option");
				option5.textContent = "Segoe UI";
				t46 = space();
				label4 = element("label");
				span12 = element("span");
				span12.textContent = "Tamaño de los puntos";
				t48 = space();
				input2 = element("input");
				t49 = space();
				output2 = element("output");
				t50 = text(/*waypointSize*/ ctx[5]);
				t51 = text("px");
				t52 = space();
				div11 = element("div");
				div11.innerHTML = `<span class="svelte-nd1yx3">ⓘ</span> La línea une los puntos en orden; no calcula navegación costera ni evita tierra.`;
				attr(div0, "class", "plugin__mobile-header");
				attr(div1, "class", "plugin__title plugin__title--chevron-back");
				attr(div2, "class", "panel-kicker svelte-nd1yx3");
				attr(button, "class", "forecast-button svelte-nd1yx3");
				button.disabled = button_disabled_value = /*forecastBusy*/ ctx[1] || /*points*/ ctx[0].length < 2;
				attr(div3, "class", "forecast-launcher svelte-nd1yx3");
				attr(summary, "class", "svelte-nd1yx3");
				attr(strong0, "class", "svelte-nd1yx3");
				attr(output0, "class", "svelte-nd1yx3");
				attr(input0, "type", "range");
				attr(input0, "min", "8");
				attr(input0, "max", "18");
				attr(input0, "step", "1");
				attr(input0, "aria-label", "Tamaño de letra de los datos de waypoint en píxeles");
				attr(input0, "class", "svelte-nd1yx3");
				attr(label0, "class", "label-font-size svelte-nd1yx3");
				attr(div4, "class", "label-field-list-heading svelte-nd1yx3");
				attr(div5, "class", "label-field-list svelte-nd1yx3");
				attr(div5, "data-label-group", "waypoint");
				attr(div6, "class", "label-setting-group svelte-nd1yx3");
				attr(strong1, "class", "svelte-nd1yx3");
				attr(output1, "class", "svelte-nd1yx3");
				attr(input1, "type", "range");
				attr(input1, "min", "8");
				attr(input1, "max", "18");
				attr(input1, "step", "1");
				attr(input1, "aria-label", "Tamaño de letra de los datos de segmento en píxeles");
				attr(input1, "class", "svelte-nd1yx3");
				attr(label1, "class", "label-font-size svelte-nd1yx3");
				attr(div7, "class", "label-field-list-heading svelte-nd1yx3");
				option0.__value = "km";
				set_input_value(option0, option0.__value);
				option1.__value = "nm";
				set_input_value(option1, option1.__value);
				attr(select0, "aria-label", "Unidad de la distancia de los segmentos");
				attr(select0, "class", "svelte-nd1yx3");
				if (/*distanceUnit*/ ctx[4] === void 0) add_render_callback(() => /*select0_change_handler*/ ctx[41].call(select0));
				attr(label2, "class", "label-unit svelte-nd1yx3");
				attr(div8, "class", "label-field-list svelte-nd1yx3");
				attr(div8, "data-label-group", "segment");
				option2.__value = "system";
				set_input_value(option2, option2.__value);
				option3.__value = "roboto";
				set_input_value(option3, option3.__value);
				option4.__value = "arial";
				set_input_value(option4, option4.__value);
				option5.__value = "segoe";
				set_input_value(option5, option5.__value);
				attr(select1, "class", "distance-font-select svelte-nd1yx3");
				attr(select1, "aria-label", "Fuente para la distancia de los tramos");
				if (/*distanceFont*/ ctx[3] === void 0) add_render_callback(() => /*select1_change_handler*/ ctx[42].call(select1));
				attr(label3, "class", "label-unit label-unit--stacked svelte-nd1yx3");
				attr(div9, "class", "label-setting-group svelte-nd1yx3");
				attr(input2, "type", "range");
				attr(input2, "min", "14");
				attr(input2, "max", "40");
				attr(input2, "step", "1");
				attr(input2, "aria-label", "Tamaño de los puntos en píxeles");
				attr(input2, "class", "svelte-nd1yx3");
				attr(output2, "class", "svelte-nd1yx3");
				attr(label4, "class", "size-picker svelte-nd1yx3");
				attr(div10, "class", "label-settings-grid svelte-nd1yx3");
				attr(details, "class", "label-settings svelte-nd1yx3");
				attr(div11, "class", "footnote svelte-nd1yx3");
				attr(section, "class", "plugin__content route-builder svelte-nd1yx3");
			},
			m(target, anchor) {
				insert(target, div0, anchor);
				insert(target, t1, anchor);
				insert(target, section, anchor);
				append(section, div1);
				append(section, t3);
				append(section, div2);
				append(section, t5);
				append(section, div3);
				append(div3, button);
				append(button, t6);
				append(section, t7);
				if (if_block) if_block.m(section, null);
				append(section, t8);
				append(section, details);
				append(details, summary);
				append(details, t10);
				append(details, div10);
				append(div10, div6);
				append(div6, strong0);
				append(div6, t12);
				append(div6, label0);
				append(label0, span2);
				append(label0, output0);
				append(output0, t14);
				append(output0, t15);
				append(label0, t16);
				append(label0, input0);
				set_input_value(input0, /*waypointLabelFontSize*/ ctx[6]);
				append(div6, t17);
				append(div6, div5);
				append(div5, div4);
				append(div5, t21);

				for (let i = 0; i < each_blocks_1.length; i += 1) {
					if (each_blocks_1[i]) {
						each_blocks_1[i].m(div5, null);
					}
				}

				append(div10, t22);
				append(div10, div9);
				append(div9, strong1);
				append(div9, t24);
				append(div9, label1);
				append(label1, span6);
				append(label1, output1);
				append(output1, t26);
				append(output1, t27);
				append(label1, t28);
				append(label1, input1);
				set_input_value(input1, /*segmentLabelFontSize*/ ctx[7]);
				append(div9, t29);
				append(div9, div8);
				append(div8, div7);
				append(div8, t33);

				for (let i = 0; i < each_blocks.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].m(div8, null);
					}
				}

				append(div8, t34);
				append(div8, label2);
				append(label2, span10);
				append(label2, t36);
				append(label2, select0);
				append(select0, option0);
				append(select0, option1);
				select_option(select0, /*distanceUnit*/ ctx[4], true);
				append(div9, t39);
				append(div9, label3);
				append(label3, span11);
				append(label3, t41);
				append(label3, select1);
				append(select1, option2);
				append(select1, option3);
				append(select1, option4);
				append(select1, option5);
				select_option(select1, /*distanceFont*/ ctx[3], true);
				append(div10, t46);
				append(div10, label4);
				append(label4, span12);
				append(label4, t48);
				append(label4, input2);
				set_input_value(input2, /*waypointSize*/ ctx[5]);
				append(label4, t49);
				append(label4, output2);
				append(output2, t50);
				append(output2, t51);
				/*details_binding*/ ctx[44](details);
				append(section, t52);
				append(section, div11);

				if (!mounted) {
					dispose = [
						listen(button, "click", /*calculateRouteForecast*/ ctx[16]),
						listen(input0, "change", /*input0_change_input_handler*/ ctx[35]),
						listen(input0, "input", /*input0_change_input_handler*/ ctx[35]),
						listen(input0, "input", /*applyLabelFontSizes*/ ctx[17]),
						listen(input1, "change", /*input1_change_input_handler*/ ctx[38]),
						listen(input1, "input", /*input1_change_input_handler*/ ctx[38]),
						listen(input1, "input", /*applyLabelFontSizes*/ ctx[17]),
						listen(select0, "change", /*select0_change_handler*/ ctx[41]),
						listen(select0, "change", /*applyDistanceUnit*/ ctx[15]),
						listen(select1, "change", /*select1_change_handler*/ ctx[42]),
						listen(select1, "change", /*applyDistanceFont*/ ctx[14]),
						listen(input2, "change", /*input2_change_input_handler*/ ctx[43]),
						listen(input2, "input", /*input2_change_input_handler*/ ctx[43]),
						listen(input2, "input", /*applyWaypointSize*/ ctx[18])
					];

					mounted = true;
				}
			},
			p(ctx, dirty) {
				if (dirty[0] & /*forecastBusy*/ 2 && t6_value !== (t6_value = (/*forecastBusy*/ ctx[1]
				? 'Calculando…'
				: 'Pronóstico de la ruta') + "")) set_data(t6, t6_value);

				if (dirty[0] & /*forecastBusy, points*/ 3 && button_disabled_value !== (button_disabled_value = /*forecastBusy*/ ctx[1] || /*points*/ ctx[0].length < 2)) {
					button.disabled = button_disabled_value;
				}

				if (/*forecastMessage*/ ctx[2]) {
					if (if_block) {
						if_block.p(ctx, dirty);
					} else {
						if_block = create_if_block(ctx);
						if_block.c();
						if_block.m(section, t8);
					}
				} else if (if_block) {
					if_block.d(1);
					if_block = null;
				}

				if (dirty[0] & /*waypointLabelFontSize*/ 64) set_data(t14, /*waypointLabelFontSize*/ ctx[6]);

				if (dirty[0] & /*waypointLabelFontSize*/ 64) {
					set_input_value(input0, /*waypointLabelFontSize*/ ctx[6]);
				}

				if (dirty[0] & /*waypointLabelRows, fieldNames, handleLabelPositionChange*/ 12544) {
					each_value_1 = ensure_array_like(/*waypointLabelRows*/ ctx[8]);
					each_blocks_1 = update_keyed_each(each_blocks_1, dirty, get_key, 1, ctx, each_value_1, each0_lookup, div5, destroy_block, create_each_block_1, null, get_each_context_1);
				}

				if (dirty[0] & /*segmentLabelFontSize*/ 128) set_data(t26, /*segmentLabelFontSize*/ ctx[7]);

				if (dirty[0] & /*segmentLabelFontSize*/ 128) {
					set_input_value(input1, /*segmentLabelFontSize*/ ctx[7]);
				}

				if (dirty[0] & /*segmentLabelRows, fieldNames, handleLabelPositionChange*/ 12800) {
					each_value = ensure_array_like(/*segmentLabelRows*/ ctx[9]);
					each_blocks = update_keyed_each(each_blocks, dirty, get_key_1, 1, ctx, each_value, each1_lookup, div8, destroy_block, create_each_block, t34, get_each_context);
				}

				if (dirty[0] & /*distanceUnit*/ 16) {
					select_option(select0, /*distanceUnit*/ ctx[4]);
				}

				if (dirty[0] & /*distanceFont*/ 8) {
					select_option(select1, /*distanceFont*/ ctx[3]);
				}

				if (dirty[0] & /*waypointSize*/ 32) {
					set_input_value(input2, /*waypointSize*/ ctx[5]);
				}

				if (dirty[0] & /*waypointSize*/ 32) set_data(t50, /*waypointSize*/ ctx[5]);
			},
			i: noop,
			o: noop,
			d(detaching) {
				if (detaching) {
					detach(div0);
					detach(t1);
					detach(section);
				}

				if (if_block) if_block.d();

				for (let i = 0; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].d();
				}

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].d();
				}

				/*details_binding*/ ctx[44](null);
				mounted = false;
				run_all(dispose);
			}
		};
	}

	const routeStorageKey = 'route-builder-saved-route-v1';
	const routeStorageBackupKey = 'route-builder-saved-route-backup-v1';
	const routeSnapshotKey = 'route-builder-route-snapshot-v1';

	function numericConditionDomain(key) {
		const field = key.toLowerCase();
		if (field.includes('rain')) return { min: 0, max: 20 };
		if (field.includes('gust')) return { min: 0, max: 120 };
		if (field.includes('wind')) return { min: 0, max: 40 };
		if (field.includes('temperature') || field.includes('feels') || field.includes('dew')) return { min: -60, max: 60 };
		if (field.includes('period')) return { min: 0, max: 30 };
		if (field.includes('power')) return { min: 0, max: 20 };
		if (field.includes('current')) return { min: 0, max: 10 };
		if (field.includes('waves') || field.includes('swell')) return { min: 0, max: 10 };
		return null;
	}

	function departureQualityColor(position) {
		const stops = [
			{ at: 0, rgb: [255, 216, 77] },
			{ at: 0.25, rgb: [217, 232, 74] },
			{ at: 0.5, rgb: [168, 217, 77] },
			{ at: 0.75, rgb: [99, 198, 83] },
			{ at: 1, rgb: [24, 165, 88] }
		];

		const value = Math.max(0, Math.min(1, position));
		const upperIndex = stops.findIndex(stop => stop.at >= value);
		const upper = stops[Math.max(0, upperIndex)];
		const lower = stops[Math.max(0, upperIndex - 1)];

		const ratio = upper.at === lower.at
		? 0
		: (value - lower.at) / (upper.at - lower.at);

		const rgb = lower.rgb.map((channel, index) => Math.round(channel + (upper.rgb[index] - channel) * ratio));
		return `#${rgb.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
	}

	function rankPassingDepartures(evaluations) {
		const ranked = evaluations.filter(item => item.passes === true && Number.isFinite(item.qualityMargin) && Number.isFinite(item.qualityAverage));
		if (!ranked.length) return;

		const compareQuality = (a, b) => {
			const marginDifference = a.qualityMargin - b.qualityMargin;
			if (Math.abs(marginDifference) > 1e-8) return marginDifference;
			return a.qualityAverage - b.qualityAverage;
		};

		ranked.sort(compareQuality);
		const groups = [];

		for (const item of ranked) {
			const group = groups[groups.length - 1];
			if (group && Math.abs(compareQuality(group[0], item)) <= 1e-8) group.push(item); else groups.push([item]);
		}

		groups.forEach((group, index) => {
			const position = groups.length === 1 ? 1 : index / (groups.length - 1);
			const qualityRank = groups.length - index;

			group.forEach(item => {
				item.qualityColor = departureQualityColor(position);
				item.qualityRank = qualityRank;
				item.qualityRankCount = groups.length;
				item.isOptimal = index === groups.length - 1;
			});
		});
	}

	function toLocalDateTimeInput(date) {
		return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
	}

	function hasValidCoordinates(lat, lon) {
		return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 && typeof lon === 'number' && Number.isFinite(lon) && lon >= -180 && lon <= 180;
	}

	function departureTimestampAtTimelineCenter(scroller) {
		const timelineStart = Number(scroller.dataset.timelineStart);
		const pixelsPerHour = Number(scroller.dataset.pixelsPerHour);
		const leftPad = Number(scroller.dataset.timebarLeftPad);
		const minDeparture = Number(scroller.dataset.minDeparture);
		const maxDeparture = Number(scroller.dataset.maxDeparture);
		if (!scroller.clientWidth || ![timelineStart, pixelsPerHour, leftPad, minDeparture, maxDeparture].every(Number.isFinite) || pixelsPerHour <= 0) return null;
		const xForTime = timestamp => leftPad + (timestamp - timelineStart) / 3600000 * pixelsPerHour;
		const minScroll = Math.max(0, xForTime(minDeparture) - scroller.clientWidth / 2);
		const maxScroll = Math.max(minScroll, xForTime(maxDeparture) - scroller.clientWidth / 2);
		const clampedScroll = Math.max(minScroll, Math.min(maxScroll, scroller.scrollLeft));
		if (Math.abs(clampedScroll - scroller.scrollLeft) > 1) scroller.scrollLeft = clampedScroll;
		const centerX = clampedScroll + scroller.clientWidth / 2;
		const timestamp = timelineStart + (centerX - leftPad) / pixelsPerHour * 3600000;
		return Math.round(Math.max(minDeparture, Math.min(maxDeparture, timestamp)) / 60000) * 60000;
	}

	function parseRouteSnapshot(serialized) {
		if (!serialized) return null;

		try {
			const snapshot = JSON.parse(serialized);

			if ((snapshot === null || snapshot === void 0
			? void 0
			: snapshot.version) !== 1 || !Array.isArray(snapshot.points)) return null;

			const ids = snapshot.points.map(point => point === null || point === void 0 ? void 0 : point.id);
			const validIds = ids.every(id => Number.isSafeInteger(id) && Number(id) > 0) && new Set(ids).size === ids.length;
			const validPoints = validIds && snapshot.points.every(point => hasValidCoordinates(point === null || point === void 0 ? void 0 : point.lat, point === null || point === void 0 ? void 0 : point.lon));
			if (!validPoints) return null;

			const points = snapshot.points.map(point => ({
				id: point.id,
				lat: point.lat,
				lon: point.lon
			}));

			const maxId = points.reduce((max, point) => Math.max(max, point.id), 0);
			const storedNextId = Number(snapshot.nextPointId);

			return {
				points,
				nextPointId: Math.max(maxId + 1, Number.isSafeInteger(storedNextId) && storedNextId > 0
				? storedNextId
				: 1),
				departureDateTime: typeof snapshot.departureDateTime === 'string' && Number.isFinite(new Date(snapshot.departureDateTime).getTime())
				? snapshot.departureDateTime
				: undefined,
				speedKnots: Number.isFinite(Number(snapshot.speedKnots)) && Number(snapshot.speedKnots) > 0
				? Number(snapshot.speedKnots)
				: undefined
			};
		} catch(_a) {
			return null;
		}
	}

	function haversineNm(a, b) {
		const rad = degrees => degrees * Math.PI / 180;
		const dLat = rad(b.lat - a.lat);
		const dLon = rad(b.lon - a.lon);
		const lat1 = rad(a.lat);
		const lat2 = rad(b.lat);
		const h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dLon / 2), 2);
		return 3440.065 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
	}

	function formatWaypointDate(date) {
		return new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
	}

	function formatWaypointHour(date) {
		return new Intl.DateTimeFormat('es',
		{
				hour: '2-digit',
				minute: '2-digit',
				hourCycle: 'h23'
			}).format(date);
	}

	function formatTimelineDateTime(timestamp) {
		if (!Number.isFinite(timestamp)) return '—';
		const date = new Date(timestamp);
		const dateLabel = new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit' }).format(date);
		return `${dateLabel} · ${formatWaypointHour(date)}`;
	}

	function formatDuration(hours) {
		const totalMinutes = Math.max(0, Math.round(hours * 60));
		const days = Math.floor(totalMinutes / 1440);
		const remainingMinutes = totalMinutes % 1440;
		const wholeHours = Math.floor(remainingMinutes / 60);
		const minutes = remainingMinutes % 60;
		if (days) return `${days}d ${wholeHours}h`;
		if (wholeHours) return `${wholeHours}h ${String(minutes).padStart(2, '0')}m`;
		return `${minutes} min`;
	}

	function trueBearing(from, to) {
		const rad = degrees => degrees * Math.PI / 180;
		const lat1 = rad(from.lat);
		const lat2 = rad(to.lat);
		const deltaLon = rad(to.lon - from.lon);
		const y = Math.sin(deltaLon) * Math.cos(lat2);
		const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
		return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
	}

	function getForecastColumnWidths(table) {
		const columns = [...table.querySelectorAll('colgroup col')];
		const defaults = columns.map((_, index) => index === 0 ? 170 : index < 4 ? 42 : 36);
		let saved = [];

		try {
			const parsed = JSON.parse(localStorage.getItem('route-builder-route-column-widths') || '[]');
			if (Array.isArray(parsed)) saved = parsed.map(Number);
		} catch(/* Use the standard widths when saved layout data is invalid. */ _a) {
			
		} /* Use the standard widths when saved layout data is invalid. */

		const widths = defaults.map((width, index) => {
			var _a;

			const inlineWidth = Number.parseFloat(((_a = columns[index]) === null || _a === void 0
			? void 0
			: _a.style.width) || '');

			// The summary and forecast columns have fixed widths. Only the row-label
			// column can be resized, matching the table's visible resize handle.
			const candidate = index === 0
			? Number.isFinite(inlineWidth) && inlineWidth > 0
				? inlineWidth
				: saved[index]
			: Number.NaN;

			return Number.isFinite(candidate) && candidate > 0
			? Math.max(170, Math.min(forecastLabelMaxWidth(), candidate))
			: width;
		});

		if (widths.length > 4) widths.fill(widths[4], 4);
		return widths;
	}

	function forecastLabelMaxWidth() {
		return window.innerWidth <= 600 ? 190 : 420;
	}

	function setForecastColumnWidth(table, index, width) {
		if (index !== 0) return;
		const column = table.querySelector('colgroup col[data-forecast-col="0"]');
		if (column) column.style.width = `${Math.max(170, Math.min(forecastLabelMaxWidth(), width))}px`;
	}

	function saveForecastColumnWidths(table) {
		const columns = [...table.querySelectorAll('colgroup col')];

		try {
			localStorage.setItem('route-builder-route-column-widths', JSON.stringify(columns.map((column, index) => index === 0
			? Number.parseFloat(column.style.width)
			: null)));
		} catch(/* Keep the current layout for this session. */ _a) {
			
		} /* Keep the current layout for this session. */
	}

	function updateConditionRangeSlider(slider) {
		var _a, _b;
		const control = slider.closest('.condition-slider-control');
		const container = slider.closest('.condition-slider');

		const minSlider = control === null || control === void 0
		? void 0
		: control.querySelector('[data-condition-slider="min"]');

		const maxSlider = control === null || control === void 0
		? void 0
		: control.querySelector('[data-condition-slider="max"]');

		if (!control || !container || !minSlider || !maxSlider) return;

		// Both thumbs and the fill must use the same fixed scale. Clamp the
		// opposite value when handles meet instead of changing its input range.
		const domainMin = Number((_a = container.dataset.conditionDomainMin) !== null && _a !== void 0
		? _a
		: minSlider.min);

		const domainMax = Number((_b = container.dataset.conditionDomainMax) !== null && _b !== void 0
		? _b
		: maxSlider.max);

		if (slider === minSlider) {
			const minValue = Number(minSlider.value);
			if (Number(maxSlider.value) < minValue) maxSlider.value = String(minValue);
		} else {
			const maxValue = Number(maxSlider.value);
			if (Number(minSlider.value) > maxValue) minSlider.value = String(maxValue);
		}

		const minValue = Number(minSlider.value);
		const maxValue = Number(maxSlider.value);
		const span = Math.max(1, domainMax - domainMin);
		const left = (minValue - domainMin) / span * 100;
		const width = (maxValue - minValue) / span * 100;
		const fill = control.querySelector('[data-condition-fill]');

		if (fill) {
			const thumbInset = 9;
			const trackWidth = Math.max(0, control.clientWidth - thumbInset * 2);
			fill.style.left = `${thumbInset + left / 100 * trackWidth}px`;
			fill.style.width = `${width / 100 * trackWidth}px`;
		}

		const unit = container.dataset.conditionUnit || '';

		const format = value => Number.isInteger(value)
		? String(value)
		: String(Number(value.toFixed(1)));

		const summary = container.querySelector('[data-condition-range-summary]');
		if (summary) summary.textContent = `${container.dataset.conditionLabel || ''} de ${format(minValue)} a ${format(maxValue)} ${unit}`.trim();
	}

	function stopMapClick(event) {
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
	}

	function onMapDomDoubleClick(event) {
		const target = event.target;

		if (!(target === null || target === void 0
		? void 0
		: target.closest('.route-builder-marker-wrap'))) return;

		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
	}

	function interpolatePoint(a, b, fraction) {
		const rad = degrees => degrees * Math.PI / 180;
		const lat1 = rad(a.lat), lon1 = rad(a.lon), lat2 = rad(b.lat), lon2 = rad(b.lon);
		const delta = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((lat2 - lat1) / 2), 2) + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon2 - lon1) / 2), 2)));
		if (delta < 1e-8) return { id: 0, lat: a.lat, lon: a.lon };
		const left = Math.sin((1 - fraction) * delta) / Math.sin(delta);
		const right = Math.sin(fraction * delta) / Math.sin(delta);
		const x = left * Math.cos(lat1) * Math.cos(lon1) + right * Math.cos(lat2) * Math.cos(lon2);
		const y = left * Math.cos(lat1) * Math.sin(lon1) + right * Math.cos(lat2) * Math.sin(lon2);
		const z = left * Math.sin(lat1) + right * Math.sin(lat2);

		return {
			id: 0,
			lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI,
			lon: Math.atan2(y, x) * 180 / Math.PI
		};
	}

	function forecastNumber(source, key, index) {
		var _a;

		const raw = (_a = source === null || source === void 0
		? void 0
		: source[key]) === null || _a === void 0
		? void 0
		: _a[index];

		if (raw === null || raw === undefined || raw === '') return null;
		const value = Number(raw);
		return Number.isFinite(value) ? value : null;
	}

	function forecastFirstNumber(source, keys, index) {
		for (const key of keys) {
			const value = forecastNumber(source, key, index);
			if (value !== null) return value;
		}

		return null;
	}

	function skyStateForModel(key, values) {
		const model = key === 'clouds' ? 'gfs' : key.replace(/Sky$/, '');

		const code = values === null || values === void 0
		? void 0
		: values[model + 'Sky'];

		if (typeof code !== 'number' || !Number.isFinite(code)) return null;
		const n = Math.round(code);
		if ([14, 15, 16, 21, 23, 24].includes(n)) return 'thunderstorm';
		if ([8, 9, 10, 11, 12, 13].includes(n)) return 'snow';
		if ([17, 22].includes(n)) return 'fog';

		if ([5, 6, 7, 18, 19, 20].includes(n)) {
			const inches = values === null || values === void 0
			? void 0
			: values[model === 'gfs' ? 'rain' : model + 'Rain'];

			if (typeof inches !== 'number' || !Number.isFinite(inches) || inches <= 0) return 'rain';
			const mm = inches * 25.4;

			return mm <= 0.2
			? 'drizzle'
			: mm <= 2.5
				? 'light-rain'
				: mm <= 7.5 ? 'rain' : 'heavy-rain';
		}

		return ({
			1: 'clear',
			2: 'partly-cloudy',
			3: 'mostly-cloudy',
			4: 'overcast'
		})[n] || null;
	}

	function forecastSkyState(source, index) {
		const cloudCover = forecastNumber(source, 'clouds', index);
		const precipitation = forecastFirstNumber(source, ['precipAmount', 'rain'], index);
		const snow = forecastFirstNumber(source, ['precipSnowAmount', 'snowPrecip'], index);
		const convective = forecastFirstNumber(source, ['precipConvectiveAmount', 'convPrecip'], index);
		const fog = forecastFirstNumber(source, ['fog', 'fog-surface'], index);
		const visibility = forecastNumber(source, 'visibility', index);
		if (fog !== null && fog > 0 || visibility !== null && visibility > 0 && visibility < 1000) return 'fog';
		if (snow !== null && snow > 0) return 'snow';
		if (convective !== null && convective >= 0.5) return 'thunderstorm';

		if (precipitation !== null && precipitation > 0) {
			if (precipitation <= 0.2) return 'drizzle';
			if (precipitation <= 2.5) return 'light-rain';
			if (precipitation <= 7.5) return 'rain';
			return 'heavy-rain';
		}

		const category = cloudCategory(cloudCover);
		if (category === null) return null;
		return ['clear', 'partly-cloudy', 'mostly-cloudy', 'overcast'][category];
	}

	function forecastCurrentVector(source, index, tidal = false) {
		if (index < 0) return { speedKnots: null, direction: null };

		const u = forecastFirstNumber(
			source,
			tidal
			? [
					'currentsTide_u',
					'currentsTideU',
					'currents_tide_u',
					'seacurrents_tide_u',
					'seacurrents_tide_u-surface'
				]
			: [
					'currents_u',
					'currentsU',
					'current_u',
					'seacurrents_u',
					'seacurrents_u-surface',
					'u'
				],
			index
		);

		const v = forecastFirstNumber(
			source,
			tidal
			? [
					'currentsTide_v',
					'currentsTideV',
					'currents_tide_v',
					'seacurrents_tide_v',
					'seacurrents_tide_v-surface'
				]
			: [
					'currents_v',
					'currentsV',
					'current_v',
					'seacurrents_v',
					'seacurrents_v-surface',
					'v'
				],
			index
		);

		if (u !== null && v !== null) {
			return {
				speedKnots: Math.hypot(u, v) * 1.94384,
				direction: (Math.atan2(u, v) * 180 / Math.PI + 360) % 360
			};
		}

		const speed = forecastFirstNumber(
			source,
			tidal
			? ['currentsTide', 'currentTide', 'currents_tide']
			: ['currents', 'current', 'currentSpeed', 'currentsSpeed'],
			index
		);

		const direction = forecastFirstNumber(
			source,
			tidal
			? ['currentsTideDir', 'currentTideDir', 'currents_tide_dir']
			: ['currentsDir', 'currentDir', 'currents_direction'],
			index
		);

		return {
			speedKnots: speed === null ? null : speed * 1.94384,
			direction
		};
	}

	function averageDirection(values) {
		if (!values.length) return null;
		const radians = values.map(value => value * Math.PI / 180);
		const x = radians.reduce((sum, value) => sum + Math.cos(value), 0);
		const y = radians.reduce((sum, value) => sum + Math.sin(value), 0);
		return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
	}

	function cloudCategory(value) {
		if (value === null || !Number.isFinite(value)) return null;
		const percent = value <= 1 ? value * 100 : value;

		return percent <= 10
		? 0
		: percent <= 35 ? 1 : percent <= 65 ? 2 : 3;
	}

	function forecastValue(sample, key, decimals = 0) {
		var _a;

		const value = (_a = sample.values) === null || _a === void 0
		? void 0
		: _a[key];

		if (value === null || value === undefined) return '—';
		const formatted = Number(value).toFixed(decimals);

		return (/rain$/i).test(key) && Number(formatted) === 0
		? ''
		: formatted;
	}

	function windyWeatherIcon(code) {
		if (code === undefined || !Number.isFinite(code)) return '·';
		const iconCode = Math.round(code);
		return `<img class="forecast-icon" src="https://www.windy.com/img/icons6/png_25@2x/${iconCode}.png" alt="" loading="lazy">`;
	}

	function forecastTextColor(color) {
		const channels = forecastColorChannels(color);

		const luminance = (channels === null || channels === void 0
		? void 0
		: channels.length) === 3
		? channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114
		: 255;

		return luminance > 155 ? '#263238' : '#fff';
	}

	function forecastColorChannels(color) {
		var _a, _b, _c;

		const rgb = (_b = (_a = color.match(/^rgba?\(([^)]+)\)$/i)) === null || _a === void 0
		? void 0
		: _a[1].match(/[\d.]+/g)) === null || _b === void 0
		? void 0
		: _b.slice(0, 3).map(Number);

		if ((rgb === null || rgb === void 0 ? void 0 : rgb.length) === 3) return rgb;

		const hex = (_c = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)) === null || _c === void 0
		? void 0
		: _c[1];

		if (!hex) return null;

		const fullHex = hex.length === 3
		? hex.split('').map(channel => channel + channel).join('')
		: hex;

		return [0, 2, 4].map(index => parseInt(fullHex.slice(index, index + 2), 16));
	}

	function mixForecastColors(first, second) {
		if (!first) return second || '#e9eded';
		if (!second) return first;
		const a = forecastColorChannels(first), b = forecastColorChannels(second);
		if (!a || !b) return first;
		return `rgb(${a.map((channel, index) => Math.round((channel + b[index]) / 2)).join(',')})`;
	}

	function instance($$self, $$props, $$invalidate) {
		var __awaiter = this && this.__awaiter || function (thisArg, _arguments, P, generator) {
			function adopt(value) {
				return value instanceof P
				? value
				: new P(function (resolve) {
							resolve(value);
						});
			}

			return new (P || (P = Promise))(function (resolve, reject) {
					function fulfilled(value) {
						try {
							step(generator.next(value));
						} catch(e) {
							reject(e);
						}
					}

					function rejected(value) {
						try {
							step(generator["throw"](value));
						} catch(e) {
							reject(e);
						}
					}

					function step(result) {
						result.done
						? resolve(result.value)
						: adopt(result.value).then(fulfilled, rejected);
					}

					step((generator = generator.apply(thisArg, _arguments || [])).next());
				});
		};

		const { title, version } = config;
		const pluginTitle = `${title} v${version}`;
		let points = [];
		let speedKnots = 10;
		let departureDateTime = toLocalDateTimeInput(new Date());
		let departureTimelineScrollLeft = 0;
		let restoredDepartureTimestamp = null;
		let recenterDepartureTimeline = false;
		let departureScrollCommitTimer = null;
		let routeSnapshotActions = ['save', 'save', 'save'];
		let routeSampleIntervalHours = 3;
		let weatherSearchDays = 15;
		let departureIntervalHours = 6;
		let forecastDrawerMaxHeightPercent = 50;
		let forecastColumnResize = null;
		const forecastDataCache = new Map();

		const skyStateOptions = [
			{
				id: 'clear',
				label: 'Despejado / soleado',
				emoji: '☀️'
			},
			{
				id: 'partly-cloudy',
				label: 'Algo nublado',
				emoji: '🌤️'
			},
			{
				id: 'mostly-cloudy',
				label: 'Parcialmente nublado',
				emoji: '🌥️'
			},
			{
				id: 'overcast',
				label: 'Nublado',
				emoji: '☁️'
			},
			{ id: 'fog', label: 'Niebla', emoji: '🌫️' },
			{
				id: 'drizzle',
				label: 'Llovizna',
				emoji: '🌦️'
			},
			{
				id: 'light-rain',
				label: 'Lluvia ligera',
				emoji: '🌦️'
			},
			{
				id: 'rain',
				label: 'Lluvia',
				emoji: '🌧️'
			},
			{
				id: 'heavy-rain',
				label: 'Lluvia intensa',
				emoji: '🌧️'
			},
			{
				id: 'thunderstorm',
				label: 'Tormenta',
				emoji: '⛈️'
			},
			{ id: 'snow', label: 'Nieve', emoji: '🌨️' }
		];

		let routeForecast = [];
		let departureEvaluations = [];
		let departureAnalysisBusy = false;
		let departureEligibilityDirty = false;
		let forecastBusy = false;
		let forecastMessage = '';
		let forecastJob = 0;
		let showWeatherSettingsMenu = false;
		let settingsTab = 'forecast';
		let liveSpeedSeconds = 5;
		let liveForecastSeconds = 60;
		let liveWaypointSeconds = 5;
		let restorePreviousRouteOnNavExit = false;
		const liveSpeedOptions = [5, 10, 30, 60, 300];
		const liveForecastOptions = [60, 300, 600, 1800];
		const liveWaypointOptions = [1, 5, 10, 30, 60, 300];
		let arrivalHours = [];
		let arrivalDays = [];
		const arrivalDayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

		function arrivalMatches(date) {
			return Number.isFinite(date.getTime()) && (!arrivalHours.length || arrivalHours.includes(date.getHours())) && (!arrivalDays.length || arrivalDays.includes(date.getDay()));
		}

		let windowConstraints = {
			ecmwfSky: { states: [] },
			mblueSky: { states: [] },
			iconSky: { states: [] },
			aromeSky: { states: [] },
			skyAverage: { states: [] },
			ecmwfTemperature: { min: '', max: '' },
			mblueTemperature: { min: '', max: '' },
			iconTemperature: { min: '', max: '' },
			aromeTemperature: { min: '', max: '' },
			ecmwfFeels: { min: '', max: '' },
			mblueFeels: { min: '', max: '' },
			iconFeels: { min: '', max: '' },
			aromeFeels: { min: '', max: '' },
			ecmwfRain: { min: '', max: '' },
			mblueRain: { min: '', max: '' },
			iconRain: { min: '', max: '' },
			aromeRain: { min: '', max: '' },
			ecmwfGust: { min: '', max: '' },
			mblueGust: { min: '', max: '' },
			iconGust: { min: '', max: '' },
			aromeGust: { min: '', max: '' },
			feels: { min: '', max: '' },
			temperatureAverage: { min: '', max: '' },
			feelsAverage: { min: '', max: '' },
			rainAverage: { min: '', max: '' },
			gustAverage: { min: '', max: '' },
			gfsDew: { min: '', max: '' },
			ecmwfDew: { min: '', max: '' },
			mblueDew: { min: '', max: '' },
			iconDew: { min: '', max: '' },
			aromeDew: { min: '', max: '' },
			dewAverage: { min: '', max: '' },
			temperature: { min: '', max: '' },
			rain: { min: '', max: '' },
			windAverage: { min: '', max: '' },
			directionAverage: { min: '', max: '' },
			wavesAverage: { min: '', max: '' },
			swell1Average: { min: '', max: '' },
			swell1PeriodAverage: { min: '', max: '' },
			wavesPeriodAverage: { min: '', max: '' },
			wavesPowerAverage: { min: '', max: '' },
			wind: { min: '', max: '' },
			ecmwfWind: { min: '', max: '' },
			mblueWind: { min: '', max: '' },
			iconWind: { min: '', max: '' },
			aromeWind: { min: '', max: '' },
			ecmwfWindDirection: { min: '', max: '' },
			mblueWindDirection: { min: '', max: '' },
			iconWindDirection: { min: '', max: '' },
			aromeWindDirection: { min: '', max: '' },
			gust: { min: '', max: '' },
			direction: { min: '', max: '' },
			waves: { min: '', max: '' },
			swell1: { min: '', max: '' },
			swell2: { min: '', max: '' },
			swell1Period: { min: '', max: '' },
			swell2Period: { min: '', max: '' },
			windWaves: { min: '', max: '' },
			windWavesPeriod: { min: '', max: '' },
			current: { min: '', max: '' },
			currentTide: { min: '', max: '' },
			wavesPeriod: { min: '', max: '' },
			wavesPower: { min: '', max: '' },
			ecmwfWaves: { min: '', max: '' },
			ecmwfSwell1: { min: '', max: '' },
			ecmwfSwell1Period: { min: '', max: '' },
			ecmwfWavesPeriod: { min: '', max: '' },
			ecmwfWavesPower: { min: '', max: '' },
			clouds: { states: [] },
			arrival: { min: '', max: '' }
		};

		let pointerFieldDrag = null;
		let activeWindowCondition = null;

		const routeFieldLabels = {
			ecmwfSky: 'Cielo',
			mblueSky: 'Cielo',
			iconSky: 'Cielo',
			aromeSky: 'Cielo',
			skyAverage: 'Cielo',
			gfsDew: 'Punto de rocío',
			ecmwfDew: 'Punto de rocío',
			mblueDew: 'Punto de rocío',
			iconDew: 'Punto de rocío',
			aromeDew: 'Punto de rocío',
			dewAverage: 'Punto de rocío',
			ecmwfTemperature: 'Temperatura',
			mblueTemperature: 'Temperatura',
			iconTemperature: 'Temperatura',
			aromeTemperature: 'Temperatura',
			ecmwfFeels: 'Sens. térmica',
			mblueFeels: 'Sens. térmica',
			iconFeels: 'Sens. térmica',
			aromeFeels: 'Sens. térmica',
			ecmwfRain: 'Lluvia',
			mblueRain: 'Lluvia',
			iconRain: 'Lluvia',
			aromeRain: 'Lluvia',
			ecmwfGust: 'Rachas',
			mblueGust: 'Rachas',
			iconGust: 'Rachas',
			aromeGust: 'Rachas',
			feels: 'Sens. térmica',
			temperatureAverage: 'Temperatura',
			feelsAverage: 'Sens. térmica',
			rainAverage: 'Lluvia',
			gustAverage: 'Rachas',
			directionAverage: 'Dirección viento promedio',
			wavesAverage: 'Olas promedio',
			swell1Average: 'Oleaje 1 promedio',
			swell1PeriodAverage: 'Período oleaje 1 promedio',
			wavesPeriodAverage: 'Período promedio',
			wavesPowerAverage: 'Potencia promedio',
			clouds: 'Cielo',
			temperature: 'Temperatura',
			rain: 'Lluvia',
			windAverage: 'Viento promedio',
			wind: 'Viento',
			ecmwfWind: 'Viento',
			mblueWind: 'Viento',
			iconWind: 'Viento',
			aromeWind: 'Viento',
			ecmwfWindDirection: 'Dirección viento',
			mblueWindDirection: 'Dirección viento',
			iconWindDirection: 'Dirección viento',
			aromeWindDirection: 'Dirección viento',
			gust: 'Rachas',
			direction: 'Dirección viento',
			waves: 'Olas',
			swell1: 'Oleaje 1',
			swell1Period: 'Período oleaje 1',
			swell2: 'Oleaje 2',
			swell2Period: 'Período oleaje 2',
			windWaves: 'Mar de viento',
			windWavesPeriod: 'Período mar de viento',
			current: 'Corriente',
			currentTide: 'Corriente de marea',
			wavesPeriod: 'Periodo',
			wavesPower: 'Potencia',
			ecmwfWaves: 'Olas',
			ecmwfSwell1: 'Oleaje 1',
			ecmwfSwell1Period: 'Período oleaje 1',
			ecmwfWavesPeriod: 'Periodo',
			ecmwfWavesPower: 'Potencia',
			arrival: 'Hora'
		};

		const routeFieldPickerLabels = {
			ecmwfSky: 'Cielo ECMWF · 9 km',
			mblueSky: 'Cielo mBlue AI · global',
			iconSky: 'Cielo ICON · 13 km',
			aromeSky: 'Cielo AROME Antillas · 2.5 km',
			skyAverage: 'Cielo · estado predominante',
			gfsDew: 'Punto de rocío GFS · global',
			ecmwfDew: 'Punto de rocío ECMWF · 9 km',
			mblueDew: 'Punto de rocío mBlue AI · global',
			iconDew: 'Punto de rocío ICON · 13 km',
			aromeDew: 'Punto de rocío AROME Antillas · 2.5 km',
			dewAverage: 'Punto de rocío promedio · modelos agregados',
			ecmwfTemperature: 'Temperatura ECMWF · 9 km',
			mblueTemperature: 'Temperatura mBlue AI · global',
			iconTemperature: 'Temperatura ICON · 13 km',
			aromeTemperature: 'Temperatura AROME Antillas · 2.5 km',
			ecmwfFeels: 'Sens. térmica ECMWF · 9 km',
			mblueFeels: 'Sens. térmica mBlue AI · global',
			iconFeels: 'Sens. térmica ICON · 13 km',
			aromeFeels: 'Sens. térmica AROME Antillas · 2.5 km',
			ecmwfRain: 'Lluvia ECMWF · 9 km',
			mblueRain: 'Lluvia mBlue AI · global',
			iconRain: 'Lluvia ICON · 13 km',
			aromeRain: 'Lluvia AROME Antillas · 2.5 km',
			ecmwfGust: 'Rachas ECMWF · 9 km',
			mblueGust: 'Rachas mBlue AI · global',
			iconGust: 'Rachas ICON · 13 km',
			aromeGust: 'Rachas AROME Antillas · 2.5 km',
			feels: 'Sens. térmica GFS · global',
			temperatureAverage: 'Temperatura promedio · modelos agregados',
			feelsAverage: 'Sens. térmica promedio · modelos agregados',
			rainAverage: 'Lluvia promedio · modelos agregados',
			gustAverage: 'Rachas promedio · modelos agregados',
			directionAverage: 'Dirección viento promedio · modelos agregados',
			wavesAverage: 'Olas promedio · modelos agregados',
			swell1Average: 'Oleaje 1 promedio · modelos agregados',
			swell1PeriodAverage: 'Período oleaje 1 promedio · modelos agregados',
			wavesPeriodAverage: 'Período promedio · modelos agregados',
			wavesPowerAverage: 'Potencia promedio · modelos agregados',
			clouds: 'Cielo GFS global',
			temperature: 'Temperatura GFS global',
			rain: 'Lluvia GFS global',
			windAverage: 'Viento promedio · modelos agregados',
			wind: 'Viento GFS global',
			ecmwfWind: 'Viento ECMWF 9 km',
			mblueWind: 'Viento mBlue AI global',
			iconWind: 'Viento ICON 13 km',
			aromeWind: 'Viento AROME Antillas 2.5 km',
			ecmwfWindDirection: 'Dirección viento ECMWF 9 km',
			mblueWindDirection: 'Dirección viento mBlue AI global',
			iconWindDirection: 'Dirección viento ICON 13 km',
			aromeWindDirection: 'Dirección viento AROME Antillas 2.5 km',
			gust: 'Rachas GFS global',
			direction: 'Dirección viento GFS global',
			waves: 'Olas GFS Waves 0.25°',
			swell1: 'Oleaje 1 GFS Waves 0.25°',
			swell2: 'Oleaje 2 GFS Waves 0.25°',
			swell1Period: 'Período oleaje 1 GFS Waves 0.25°',
			swell2Period: 'Período oleaje 2 GFS Waves 0.25°',
			windWaves: 'Mar de viento GFS Waves 0.25°',
			windWavesPeriod: 'Período mar de viento GFS Waves 0.25°',
			current: 'Corriente CMEMS 8 km',
			currentTide: 'Corriente de marea CMEMS 8 km',
			wavesPeriod: 'Periodo GFS Waves 0.25°',
			wavesPower: 'Potencia GFS Waves 0.25°',
			ecmwfWaves: 'Olas ECMWF WAM',
			ecmwfSwell1: 'Oleaje 1 ECMWF WAM',
			ecmwfSwell1Period: 'Período oleaje 1 ECMWF WAM',
			ecmwfWavesPeriod: 'Período ECMWF WAM',
			ecmwfWavesPower: 'Potencia ECMWF WAM',
			arrival: 'Hora de paso'
		};

		const windowFieldKeys = [
			'skyAverage',
			'ecmwfSky',
			'mblueSky',
			'iconSky',
			'aromeSky',
			'gfsDew',
			'ecmwfDew',
			'mblueDew',
			'iconDew',
			'aromeDew',
			'dewAverage',
			'ecmwfTemperature',
			'mblueTemperature',
			'iconTemperature',
			'aromeTemperature',
			'ecmwfFeels',
			'mblueFeels',
			'iconFeels',
			'aromeFeels',
			'ecmwfRain',
			'mblueRain',
			'iconRain',
			'aromeRain',
			'ecmwfGust',
			'mblueGust',
			'iconGust',
			'aromeGust',
			'feels',
			'temperatureAverage',
			'feelsAverage',
			'rainAverage',
			'gustAverage',
			'dewAverage',
			'directionAverage',
			'wavesAverage',
			'swell1Average',
			'swell1PeriodAverage',
			'wavesPeriodAverage',
			'wavesPowerAverage',
			'arrival',
			'clouds',
			'temperature',
			'rain',
			'windAverage',
			'wind',
			'ecmwfWind',
			'mblueWind',
			'iconWind',
			'aromeWind',
			'ecmwfWindDirection',
			'mblueWindDirection',
			'iconWindDirection',
			'aromeWindDirection',
			'gust',
			'direction',
			'waves',
			'swell1',
			'swell1Period',
			'swell2',
			'swell2Period',
			'windWaves',
			'windWavesPeriod',
			'current',
			'currentTide',
			'wavesPeriod',
			'wavesPower',
			'ecmwfWaves',
			'ecmwfSwell1',
			'ecmwfSwell1Period',
			'ecmwfWavesPeriod',
			'ecmwfWavesPower'
		];

		// Campos sin proveedor validado se excluyen de selectores y condiciones.
		const unsupportedFields = new Set([
				'skyAverage',
				'clouds',
				'ecmwfSky',
				'mblueSky',
				'iconSky',
				'aromeSky',
				'current',
				'currentTide',
				'ecmwfSwell1',
				'ecmwfSwell1Period',
				'wavesPower',
				'ecmwfWavesPower',
				'wavesPowerAverage'
			]);

		for (let i = windowFieldKeys.length - 1; i >= 0; i--) {
			const field = windowFieldKeys[i];
			if (field.startsWith('mblue') || field.startsWith('arome') || unsupportedFields.has(field)) windowFieldKeys.splice(i, 1);
		}

		const windModelFieldKeys = ['wind', 'ecmwfWind', 'iconWind'];

		const additionalGroups = {
			skyAverage: {
				fields: ['clouds', 'ecmwfSky', 'mblueSky', 'iconSky', 'aromeSky'],
				label: 'Cielo',
				unit: '',
				decimals: 0,
				circular: false
			},
			dewAverage: {
				fields: ['gfsDew', 'ecmwfDew', 'mblueDew', 'iconDew', 'aromeDew'],
				label: 'Punto de rocío',
				unit: ' °C',
				decimals: 1,
				circular: false
			},
			temperatureAverage: {
				fields: [
					'temperature',
					'ecmwfTemperature',
					'mblueTemperature',
					'iconTemperature',
					'aromeTemperature'
				],
				label: 'Temperatura',
				unit: ' °C',
				decimals: 1,
				circular: false
			},
			feelsAverage: {
				fields: ['feels', 'ecmwfFeels', 'mblueFeels', 'iconFeels', 'aromeFeels'],
				label: 'Sens. térmica',
				unit: ' °C',
				decimals: 1,
				circular: false
			},
			rainAverage: {
				fields: ['rain', 'ecmwfRain', 'mblueRain', 'iconRain', 'aromeRain'],
				label: 'Lluvia',
				unit: ' in',
				decimals: 2,
				circular: false
			},
			gustAverage: {
				fields: ['gust', 'ecmwfGust', 'mblueGust', 'iconGust', 'aromeGust'],
				label: 'Rachas',
				unit: ' kt',
				decimals: 0,
				circular: false
			},
			directionAverage: {
				fields: [
					'direction',
					'ecmwfWindDirection',
					'mblueWindDirection',
					'iconWindDirection',
					'aromeWindDirection'
				],
				label: 'Dirección viento',
				unit: '°',
				decimals: 0,
				circular: true
			},
			wavesAverage: {
				fields: ['waves', 'ecmwfWaves'],
				label: 'Olas',
				unit: ' m',
				decimals: 1,
				circular: false
			},
			swell1Average: {
				fields: ['swell1', 'ecmwfSwell1'],
				label: 'Oleaje 1',
				unit: ' m',
				decimals: 1,
				circular: false
			},
			swell1PeriodAverage: {
				fields: ['swell1Period', 'ecmwfSwell1Period'],
				label: 'Período oleaje 1',
				unit: ' s',
				decimals: 1,
				circular: false
			},
			wavesPeriodAverage: {
				fields: ['wavesPeriod', 'ecmwfWavesPeriod'],
				label: 'Período',
				unit: ' s',
				decimals: 1,
				circular: false
			},
			wavesPowerAverage: {
				fields: ['wavesPower', 'ecmwfWavesPower'],
				label: 'Potencia',
				unit: ' kW/m',
				decimals: 0,
				circular: false
			}
		};

		let collapsedGroups = {};

		function activeGroupFields(key) {
			const group = additionalGroups[key];

			return group
			? routeFieldOrder.filter(field => group.fields.includes(field) && !hiddenRouteFields.has(field))
			: [];
		}

		function groupValue(key, values) {
			const group = additionalGroups[key];
			if (!group) return null;

			const readings = activeGroupFields(key).map(field => values === null || values === void 0
			? void 0
			: values[field]).filter(value => typeof value === 'number' && Number.isFinite(value));

			if (!readings.length) return null;

			return group.circular
			? averageDirection(readings)
			: readings.reduce((a, b) => a + b, 0) / readings.length;
		}

		const directionNames = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

		const windDirectionConditionKeys = [
			'directionAverage',
			'direction',
			'ecmwfWindDirection',
			'mblueWindDirection',
			'iconWindDirection',
			'aromeWindDirection'
		];

		const directionFields = {
			direction: 'direction',
			ecmwfWindDirection: 'ecmwfWindDirection',
			mblueWindDirection: 'mblueWindDirection',
			iconWindDirection: 'iconWindDirection',
			aromeWindDirection: 'aromeWindDirection',
			waves: 'wavesDir',
			ecmwfWaves: 'ecmwfWavesDir',
			swell1: 'swell1Dir',
			ecmwfSwell1: 'ecmwfSwell1Dir',
			swell2: 'swell2Dir',
			windWaves: 'windWavesDir',
			current: 'currentDir',
			currentTide: 'currentTideDir'
		};

		const directionGroups = ['directionAverage', 'wavesAverage', 'swell1Average'];
		let directionSelections = {};

		function hasDirectionWheel(key) {
			return Boolean(directionFields[key]) || directionGroups.includes(key);
		}

		function selectedDirections(key) {
			return hasDirectionWheel(key)
			? directionSelections[key] || []
			: [];
		}

		function fieldDirection(key, values) {
			const direct = directionFields[key];

			if (direct) {
				const value = values === null || values === void 0
				? void 0
				: values[direct];

				return typeof value === 'number' && Number.isFinite(value)
				? (value % 360 + 360) % 360
				: null;
			}

			const members = key === 'windAverage'
			? activeWindModelFields()
			: additionalGroups[key] ? activeGroupFields(key) : [];

			if (!members.length) return null;
			const directions = members.map(member => fieldDirection(member, values)).filter(value => value !== null);
			if (!directions.length) return null;
			const radians = directions.map(value => value * Math.PI / 180);

			const x = radians.reduce((sum, value) => sum + Math.cos(value), 0),
				y = radians.reduce((sum, value) => sum + Math.sin(value), 0);

			return Math.hypot(x, y) > 1e-10
			? averageDirection(directions)
			: null;
		}

		function directionMatches(key, values) {
			const selected = selectedDirections(key);
			if (!selected.length) return true;
			const bearing = fieldDirection(key, values);

			return bearing === null
			? null
			: selected.includes(Math.floor((bearing + 22.5) / 45) % 8);
		}

		function directionWheel(key) {
			if (!hasDirectionWheel(key)) return '';
			const selected = selectedDirections(key);

			const buttons = directionNames.map((name, index) => {
				const angle = index * Math.PI / 4, delta = Math.PI / 8;

				const x1 = 50 + 50 * Math.sin(angle - delta),
					y1 = 50 - 50 * Math.cos(angle - delta);

				const x2 = 50 + 50 * Math.sin(angle + delta),
					y2 = 50 - 50 * Math.cos(angle + delta);

				const x = 50 + 33 * Math.sin(angle), y = 50 - 33 * Math.cos(angle);
				return `<button type="button" class="direction-sector${selected.includes(index) ? ' is-selected' : ''}" data-direction-sector="${index}" aria-label="${name}" aria-pressed="${selected.includes(index)}" style="clip-path:polygon(50% 50%,${x1}% ${y1}%,${x2}% ${y2}%);"><span style="left:${x}%;top:${y}%">${name}</span></button>`;
			}).join('');

			const meaning = key === 'current' || key === 'currentTide'
			? 'Dirección de la corriente'
			: 'Dirección del pronóstico';

			return `<div class="direction-wheel-box"><strong>${meaning}</strong><div class="direction-wheel" aria-label="Direcciones aceptadas">${buttons}</div><button type="button" class="forecast-button" data-direction-all>Seleccionar todas</button><small>Sin selección: se aceptan todas las direcciones.</small></div>`;
		}

		let windModelRowsCollapsed = true;
		let windIndicatorField = '';
		let windIndicatorUserChoice = false;
		let windIndicatorDistance = 50;
		let windIndicatorSize = 20;
		let windIndicatorTextSize = 10;
		let windIndicatorDegreesEnabled = true;
		let waveIndicatorField = '';
		let waveIndicatorUserChoice = false;
		let waveIndicatorDistance = 50;
		let waveIndicatorSize = 20;
		let waveIndicatorTextSize = 10;
		let waveIndicatorDegreesEnabled = true;
		let windRoseEnabled = false;
		let windRoseRadius = 50;
		let windRoseLineWidth = 10;
		let windRoseFontSize = 7;
		let windRoseTransparency = 75;
		let windRoseLabelMode = 'cardinal';
		let windRoseSignature = '';
		let headingDegreesEnabled = false;
		let headingDegreesFontSize = 14;
		let headingDegreesWidth = 58;
		let headingDegreesHeight = 26;
		let laylineMode = 'none';
		let upwindLaylineAngle = 45;
		let downwindLaylineAngle = 135;
		let portWindLaylineColor = '#68dc89';
		let starboardWindLaylineColor = '#e53935';
		let visualAidsOpen = false;
		let windIndicatorSettingsOpen = false;
		let waveIndicatorSettingsOpen = false;
		let laylinesSettingsOpen = false;
		let windRoseSettingsOpen = false;

		function activeWindModelFields() {
			return routeFieldOrder.filter(key => windModelFieldKeys.includes(key) && !hiddenRouteFields.has(key));
		}

		function windIndicatorOptions() {
			const fields = activeGroupFields('directionAverage');

			return fields.length > 1
			? ['directionAverage', ...fields]
			: fields;
		}

		function waveIndicatorOptions() {
			const directFields = routeFieldOrder.filter(key => ['waves', 'ecmwfWaves', 'swell1', 'ecmwfSwell1', 'swell2', 'windWaves'].includes(key) && !hiddenRouteFields.has(key));
			const averages = [];
			if (activeGroupFields('wavesAverage').length > 1) averages.push('wavesAverage');
			if (activeGroupFields('swell1Average').length > 1) averages.push('swell1Average');
			return [...averages, ...directFields];
		}

		function averageWindForValues(values) {
			const readings = activeWindModelFields().map(key => values === null || values === void 0
			? void 0
			: values[key]).filter(value => value !== null && value !== undefined && Number.isFinite(value));

			return readings.length
			? readings.reduce((sum, value) => sum + value, 0) / readings.length
			: null;
		}

		function departureQualityMetrics(routeValues) {
			var _a, _b, _c;
			const margins = [];
			const averageScores = [];

			for (const key of new Set(windowFieldKeys)) {
				if (key === 'arrival' || isSkyField(key) || windDirectionConditionKeys.includes(key) || ((_a = additionalGroups[key]) === null || _a === void 0
				? void 0
				: _a.circular)) continue;

				const bounds = windowConstraints[key];

				const parseBound = value => value === '' || value === null || value === undefined || !Number.isFinite(Number(value))
				? null
				: Number(value);

				const domain = numericConditionDomain(key);
				let min = parseBound(bounds.min);
				let max = parseBound(bounds.max);

				// Slider endpoints represent an open side of the range.
				if (min !== null && domain && min <= domain.min) min = null;

				if (max !== null && domain && max >= domain.max) max = null;
				if (min === null && max === null) continue;

				const values = routeValues.map(row => {
					if (key === 'windAverage') return averageWindForValues(row);
					if (additionalGroups[key]) return groupValue(key, row);
					const value = row[key];

					return typeof value === 'number' && Number.isFinite(value)
					? value
					: null;
				});

				if (!values.length || values.some(value => value === null)) continue;
				const readings = values;
				const observedMin = Math.min(...readings);
				const observedMax = Math.max(...readings);
				const observedAverage = readings.reduce((sum, value) => sum + value, 0) / readings.length;

				const domainWidth = Math.max(1, ((_b = domain === null || domain === void 0
				? void 0
				: domain.max) !== null && _b !== void 0
				? _b
				: 0) - ((_c = domain === null || domain === void 0
				? void 0
				: domain.min) !== null && _c !== void 0
				? _c
				: 0));

				if (min !== null && max !== null) {
					const width = max - min;

					if (width > 0) {
						margins.push(Math.min(observedMin - min, max - observedMax) / width);
						const center = (min + max) / 2;
						averageScores.push(1 - Math.abs(observedAverage - center) / (width / 2));
					} else {
						margins.push(-Math.max(Math.abs(observedMin - min), Math.abs(observedMax - max)) / domainWidth);
						averageScores.push(-Math.abs(observedAverage - min) / domainWidth);
					}
				} else if (min !== null) {
					margins.push((observedMin - min) / domainWidth);
					averageScores.push((observedAverage - min) / domainWidth);
				} else if (max !== null) {
					margins.push((max - observedMax) / domainWidth);
					averageScores.push((max - observedAverage) / domainWidth);
				}
			}

			if (!margins.length) return null;

			return {
				margin: Math.min(...margins),
				average: averageScores.reduce((sum, score) => sum + score, 0) / averageScores.length
			};
		}

		let routeFieldOrder = [...windowFieldKeys];

		for (const key of Object.keys(additionalGroups)) {
			if (!windowFieldKeys.includes(key)) continue;
			routeFieldOrder = routeFieldOrder.filter(field => field !== key);
			const index = routeFieldOrder.findIndex(field => additionalGroups[key].fields.includes(field));
			routeFieldOrder.splice(Math.max(0, index), 0, key);
		}

		const newModelFields = [
			'gfsDew',
			'ecmwfDew',
			'mblueDew',
			'iconDew',
			'aromeDew',
			'ecmwfTemperature',
			'mblueTemperature',
			'iconTemperature',
			'aromeTemperature',
			'ecmwfFeels',
			'mblueFeels',
			'iconFeels',
			'aromeFeels',
			'ecmwfRain',
			'mblueRain',
			'iconRain',
			'aromeRain',
			'ecmwfGust',
			'mblueGust',
			'iconGust',
			'aromeGust',
			'feels'
		];

		const skyModelFields = ['ecmwfSky', 'mblueSky', 'iconSky', 'aromeSky'];

		function isSkyField(key) {
			return key === 'clouds' || key === 'skyAverage' || skyModelFields.includes(key);
		}

		let hiddenRouteFields = new Set([...newModelFields, ...skyModelFields]);
		let showRouteFieldPicker = false;
		let selectedRouteFields = new Set();
		let draggedRouteField = null;
		let windowConditionsDirty = false;
		let distanceFont = 'system';
		let distanceUnit = 'km';
		let waypointSize = 18;
		let waypointLabelFontSize = 10;
		let segmentLabelFontSize = 11;
		let showWaypointDate = true;
		let showWaypointHour = true;
		let showWaypointDistanceAccumulated = true;
		let showWaypointTimeAccumulated = true;
		let showWaypointDistanceRemaining = true;
		let showWaypointTimeRemaining = true;
		let waypointDatePosition = 'below';
		let waypointHourPosition = 'below';
		let showSegmentTime = true;
		let showSegmentBearing = true;
		let showSegmentDistance = true;
		let segmentTimePosition = 'above';
		let segmentBearingPosition = 'above';
		let segmentDistancePosition = 'above';

		const waypointLabelFields = [
			'waypoint-date',
			'waypoint-hour',
			'waypoint-distance-accumulated',
			'waypoint-time-accumulated',
			'waypoint-distance-remaining',
			'waypoint-time-remaining'
		];

		let pointerLabelDrag = null;

		let waypointFieldPositions = {
			'waypoint-date': 'below',
			'waypoint-hour': 'below',
			'waypoint-distance-accumulated': 'below',
			'waypoint-time-accumulated': 'below',
			'waypoint-distance-remaining': 'below',
			'waypoint-time-remaining': 'below'
		};

		let waypointFieldOrder = [...waypointLabelFields];
		let segmentFieldOrder = ['segment-time', 'segment-bearing', 'segment-distance'];

		const fieldNames = {
			'waypoint-date': 'Fecha',
			'waypoint-hour': 'Hora',
			'waypoint-distance-accumulated': 'Distancia acumulada',
			'waypoint-time-accumulated': 'Tiempo acumulado',
			'waypoint-distance-remaining': 'Distancia restante',
			'waypoint-time-remaining': 'Tiempo restante',
			'segment-time': 'Tiempo',
			'segment-bearing': 'Rumbo verdadero',
			'segment-distance': 'Distancia'
		};

		let waypointLabelRows = [];
		let segmentLabelRows = [];

		function isWaypointFieldVisible(field) {
			if (field === 'waypoint-date') return showWaypointDate;
			if (field === 'waypoint-hour') return showWaypointHour;
			if (field === 'waypoint-distance-accumulated') return showWaypointDistanceAccumulated;
			if (field === 'waypoint-time-accumulated') return showWaypointTimeAccumulated;
			if (field === 'waypoint-distance-remaining') return showWaypointDistanceRemaining;
			if (field === 'waypoint-time-remaining') return showWaypointTimeRemaining;
			return false;
		}

		function labelFieldPosition(group, field) {
			var _a;

			if (group === 'waypoint') return isWaypointFieldVisible(field)
			? (_a = waypointFieldPositions[field]) !== null && _a !== void 0
				? _a
				: 'below'
			: null;

			const active = field === 'segment-time'
			? showSegmentTime
			: field === 'segment-bearing'
				? showSegmentBearing
				: showSegmentDistance;

			if (!active) return null;

			return field === 'segment-time'
			? segmentTimePosition
			: field === 'segment-bearing'
				? segmentBearingPosition
				: segmentDistancePosition;
		}

		function setLabelFieldPosition(group, field, side, checked) {
			const current = labelFieldPosition(group, field);
			const enabled = checked || current !== null && current !== side;

			if (group === 'waypoint') {
				if (field === 'waypoint-date') $$invalidate(20, showWaypointDate = enabled); else if (field === 'waypoint-hour') $$invalidate(21, showWaypointHour = enabled); else if (field === 'waypoint-distance-accumulated') $$invalidate(22, showWaypointDistanceAccumulated = enabled); else if (field === 'waypoint-time-accumulated') $$invalidate(23, showWaypointTimeAccumulated = enabled); else if (field === 'waypoint-distance-remaining') $$invalidate(24, showWaypointDistanceRemaining = enabled); else if (field === 'waypoint-time-remaining') $$invalidate(25, showWaypointTimeRemaining = enabled);
				if (checked) $$invalidate(32, waypointFieldPositions = Object.assign(Object.assign({}, waypointFieldPositions), { [field]: side }));
			} else if (field === 'segment-time') {
				$$invalidate(26, showSegmentTime = enabled);
				if (checked) $$invalidate(29, segmentTimePosition = side);
			} else if (field === 'segment-bearing') {
				$$invalidate(27, showSegmentBearing = enabled);
				if (checked) $$invalidate(30, segmentBearingPosition = side);
			} else if (field === 'segment-distance') {
				$$invalidate(28, showSegmentDistance = enabled);
				if (checked) $$invalidate(31, segmentDistancePosition = side);
			}

			applyLabelSettings();
		}

		function handleLabelPositionChange(event, group, field, side) {
			setLabelFieldPosition(group, field, side, event.currentTarget.checked);
		}

		const distanceFontStacks = {
			system: '-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
			roboto: 'Roboto, Arial, sans-serif',
			arial: 'Arial, sans-serif',
			segoe: '"Segoe UI", sans-serif'
		};

		let nextPointId = 1;
		let recentlyDraggedWaypoint = null;
		let waypointLayer = null;
		let pastWaypointLayer = null;
		let pastRouteLine = null;
		let livePastWaypoints = [];
		let liveOriginalWaypointNumbers = new Map();
		const waypointMarkers = new Map();
		const waypointMarkerSizes = new WeakMap();
		const waypointMarkerLabelLayouts = new WeakMap();
		const segmentLabelGroups = new Map();
		let distanceLabelOverlay = null;
		let routeLine = null;
		let forecastHighlightMarker = null;
		let hoverRestoreTimestamp = null;
		let hoveredForecastTimestamp = null;
		let forecastDrawer = null;
		let forecastReopenButton = null;
		let gpsButton = null;
		let liveButton = null;
		let centerButton = null;
		let zoomInButton = null;
		let zoomOutButton = null;
		let centerLayoutObserver = null;
		let centerLayoutFrame = null;
		let centerRequestVersion = 0;
		let gpsPositionMarker = null;
		let gpsCourseOverlay = null;
		let gpsCourseLine = null;
		let windIndicatorOverlay = null;
		let waveIndicatorOverlay = null;
		let windRoseOverlay = null;
		let headingDegreesOverlay = null;
		let upwindLaylineLayers = [];
		let downwindLaylineLayers = [];
		let gpsRequestGeneration = 0;
		let gpsWatchId = null;
		let navigationActive = false;
		let followBoat = false;
		let liveRouteActive = false;
		let navigationPlanBackupActive = false;
		let autoLivePending = false;
		let liveRefreshTimer = null;
		let liveWaypointTimer = null;
		let liveDisplayPoints = null;
		let liveRouteUpdatedAt = 0;
		let navigationPanel = null;
		let navigationFix = null;
		let recentGpsSpeeds = [];
		let navigationRefreshTimer = null;
		let navigationTargetId = null;
		let waypointArrivalConfirmations = 0;
		let lastNavigationFixTimestamp = 0;
		let gpsCourseAnchor = null;
		let gpsCourse = null;
		let windyControlsStyles = [];
		let mapLabelSettings = null;
		const routeSnapshotKeys = [routeSnapshotKey, `${routeSnapshotKey}-2`, `${routeSnapshotKey}-3`];

		function getForecastRequest(model, lat, lon) {
			return __awaiter(this, void 0, void 0, function* () {
				if (points.length < 2) throw new Error('Se necesitan al menos dos puntos de ruta.');

				if (!hasValidCoordinates(lat, lon)) {
					throw new Error(`Coordenadas inválidas para la consulta: lat ${lat}, lon ${lon}.`);
				}

				const days = Math.max(1, Math.min(15, Math.floor(Number(weatherSearchDays) || 7)));
				let timeoutId = 0;

				const timeout = new Promise((_, reject) => {
						timeoutId = window.setTimeout(() => reject(new Error(`Windy no respondió a la consulta ${model} en 20 segundos.`)), 20000);
					});

				try {
					return yield Promise.race([
						(() => __awaiter(this, void 0, void 0, function* () {
							const options = {
								lat,
								lon,
								step: 1,
								days,
								extended: true,
								interpolate: true,
								source: 'multiload'
							};

							const atmospheric = ['gfs', 'ecmwf', 'mblue', 'icon', 'aromeAntilles'].includes(model);
							if (!atmospheric) return getPointForecastData(model, options);

							try {
								return yield getPointForecastData(model, options, { meteogram: true });
							} catch(_a) {
								return getPointForecastData(model, options);
							}
						}))(),
						timeout
					]);
				} finally {
					window.clearTimeout(timeoutId);
				}
			});
		}

		function getCachedForecastBundle(lat, lon) {
			return __awaiter(this, void 0, void 0, function* () {
				var _a;
				const days = Math.max(1, Math.min(15, Math.floor(Number(weatherSearchDays) || 7)));
				const key = `gfs+ecmwf+gfsWaves+ecmwfWaves+cmems+mblue+icon+aromeAntilles:${days}:${lat.toFixed(5)}:${lon.toFixed(5)}`;
				const existing = forecastDataCache.get(key);
				if (existing && existing.expiresAt > Date.now()) return existing.promise;
				if (existing) forecastDataCache.delete(key);

				const promise = (() => __awaiter(this, void 0, void 0, function* () {
					const optionalForecast = model => __awaiter(this, void 0, void 0, function* () {
						var _a, _b;

						try {
							const response = yield getForecastRequest(model, lat, lon);

							const forecast = ((_a = response === null || response === void 0
							? void 0
							: response.data) === null || _a === void 0
							? void 0
							: _a.data) || (response === null || response === void 0
							? void 0
							: response.data);

							if (forecast && ((_b = response === null || response === void 0
							? void 0
							: response.data) === null || _b === void 0
							? void 0
							: _b.meteogram)) forecast.__meteogram = response.data.meteogram;

							if (!forecast || !Array.isArray(forecast.ts)) throw new Error(`${model} respondió sin una serie temporal utilizable.`);
							return { forecast, error: undefined };
						} catch(error) {
							return {
								forecast: null,
								error: error instanceof Error ? error.message : String(error)
							};
						}
					});

					const [
						gfsResult,
						ecmwfResult,
						seaResult,
						ecmwfSeaResult,
						currentsResult,
						mblueResult,
						iconResult,
						aromeResult
					] = yield Promise.all([
						optionalForecast('gfs'),
						optionalForecast('ecmwf'),
						optionalForecast('gfsWaves'),
						optionalForecast('ecmwfWaves'),
						optionalForecast('cmems'),
						optionalForecast('mblue'),
						optionalForecast('icon'),
						optionalForecast('aromeAntilles')
					]);

					if (![
						gfsResult,
						ecmwfResult,
						seaResult,
						ecmwfSeaResult,
						currentsResult,
						mblueResult,
						iconResult,
						aromeResult
					].some(result => result.forecast)) {
						throw new Error('Ningún modelo devolvió datos para esta ubicación.');
					}

					const data = gfsResult.forecast || { ts: [] };
					const ecmwfData = ecmwfResult.forecast;
					const seaData = seaResult.forecast;
					const ecmwfSeaData = ecmwfSeaResult.forecast;
					const currentsData = currentsResult.forecast;
					const mblueData = mblueResult.forecast;
					const iconData = iconResult.forecast;
					const aromeData = aromeResult.forecast;

					const mblueError = mblueData
					? undefined
					: mblueResult.error || 'mBlue AI respondió sin una serie horaria de viento utilizable.';

					const iconError = iconData
					? undefined
					: iconResult.error || 'ICON respondió sin una serie horaria de viento utilizable.';

					const aromeError = aromeData
					? undefined
					: aromeResult.error || 'AROME Antillas respondió sin una serie horaria de viento utilizable.';

					const currentsError = currentsData
					? undefined
					: currentsResult.error || 'CMEMS respondió sin una serie temporal de corrientes utilizable.';

					const ecmwfError = ecmwfData
					? undefined
					: ecmwfResult.error || 'ECMWF respondió sin una serie horaria de viento utilizable.';

					const seaError = seaResult.error;
					const ecmwfSeaError = ecmwfSeaResult.error;

					return {
						data,
						seaData,
						ecmwfData,
						ecmwfSeaData,
						currentsData,
						mblueData,
						iconData,
						aromeData,
						seaError,
						ecmwfError,
						ecmwfSeaError,
						currentsError,
						mblueError,
						iconError,
						aromeError
					};
				}))();

				forecastDataCache.set(key, {
					expiresAt: Date.now() + 30 * 60 * 1000,
					promise
				});

				while (forecastDataCache.size > 240) forecastDataCache.delete(forecastDataCache.keys().next().value);

				try {
					return yield promise;
				} catch(error) {
					if (((_a = forecastDataCache.get(key)) === null || _a === void 0
					? void 0
					: _a.promise) === promise) forecastDataCache.delete(key);

					throw error;
				}
			});
		}

		function loadForecastBundles(samples, job, onBundleLoaded) {
			return __awaiter(this, void 0, void 0, function* () {
				let next = 0;

				const worker = () => __awaiter(this, void 0, void 0, function* () {
					while (next < samples.length && job === forecastJob) {
						const index = next++;
						const sample = samples[index];

						try {
							const bundle = yield getCachedForecastBundle(sample.lat, sample.lon);
							if (job !== forecastJob) return;
							onBundleLoaded(index, { bundle });
						} catch(error) {
							if (job !== forecastJob) return;

							onBundleLoaded(index, {
								error: error instanceof Error
								? error.message
								: 'No se pudo consultar el pronóstico de Windy.'
							});
						}
					}
				});

				yield Promise.all(Array.from({ length: Math.min(4, samples.length) }, worker));
			});
		}

		function selectDepartureTime(value) {
			if (liveRouteActive) return;
			const selected = value instanceof Date ? value : new Date(value);
			if (!Number.isFinite(selected.getTime())) return;
			restoredDepartureTimestamp = null;
			departureDateTime = toLocalDateTimeInput(selected);
			updateNavigationPanel();
			saveRoute();
			updateQuickDepartureFields(selected.getTime());
			redrawMap();

			// The selected departure changes each route sample's ETA, so refresh
			// the route forecast and, when configured, re-evaluate all candidate
			// departures against their new passage times.
			if (forecastDrawer === null || forecastDrawer === void 0
			? void 0
			: forecastDrawer.classList.contains('is-open')) void calculateRouteForecast();
		}

		function snapDepartureTimestamp(timestamp, minDeparture, maxDeparture) {
			const interval = Math.max(1, Number(departureIntervalHours) || 1);
			const input = new Date(timestamp);
			const midnight = new Date(input);
			midnight.setHours(0, 0, 0, 0);
			let closest = Math.max(minDeparture, Math.min(maxDeparture, timestamp));
			let closestDelta = Number.POSITIVE_INFINITY;

			for (let dayOffset = -1; dayOffset <= 1; dayOffset++) {
				const day = new Date(midnight);
				day.setDate(day.getDate() + dayOffset);

				for (let hour = 0; hour < 24; hour += interval) {
					const candidate = new Date(day);
					candidate.setHours(hour, 0, 0, 0);
					const candidateTime = candidate.getTime();
					if (candidateTime < minDeparture || candidateTime > maxDeparture) continue;
					const delta = Math.abs(candidateTime - timestamp);

					if (delta < closestDelta) {
						closest = candidateTime;
						closestDelta = delta;
					}
				}
			}

			return closest;
		}

		function updateQuickDepartureFields(departureTimestamp) {
			if (!forecastDrawer) return;
			const durationHours = points.slice(1).reduce((hours, point, index) => hours + haversineNm(points[index], point) / Math.max(0.1, speedKnots), 0);
			const distanceNm = points.slice(1).reduce((distance, point, index) => distance + haversineNm(points[index], point), 0);
			const arrivalTimestamp = departureTimestamp + durationHours * 3600000;
			const compactDate = new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit' });
			const formatDateTime = timestamp => `${compactDate.format(new Date(timestamp))} · ${formatWaypointHour(new Date(timestamp))}`;
			const timebarScroll = forecastDrawer.querySelector('.departure-timebar-scroll');
			const callout = forecastDrawer.querySelector('.departure-timebar-callout');

			if (callout && timebarScroll) {
				const distanceLabel = distanceUnit === 'km'
				? `${(distanceNm * 1.852).toFixed(1)} km`
				: `${distanceNm.toFixed(1)} Nm`;

				callout.innerHTML = `<span>Inicio ${formatDateTime(departureTimestamp)} → Llega ${formatDateTime(arrivalTimestamp)}</span><small>Duración: ${formatDuration(durationHours)} · ${distanceLabel}</small>`;
			}

			const arrivalRow = forecastDrawer.querySelector('tr[data-route-field-row="arrival"]');

			const summary = arrivalRow === null || arrivalRow === void 0
			? void 0
			: arrivalRow.querySelectorAll('.forecast-stat-cell b');

			if ((summary === null || summary === void 0
			? void 0
			: summary.length) === 3) {
				summary[0].textContent = formatDateTime(departureTimestamp);
				summary[1].textContent = formatDateTime(arrivalTimestamp);
				summary[2].textContent = formatDuration(durationHours);
			}
		}

		function updateLiveDrawerTimes(timestamp) {
			if (!forecastDrawer || forecastDrawer.hidden) return;
			const arrivalRow = forecastDrawer.querySelector('tr[data-route-field-row="arrival"]');
			const dateFormat = new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit' });

			arrivalRow === null || arrivalRow === void 0
			? void 0
			: arrivalRow.querySelectorAll('td[data-forecast-index]').forEach(cell => {
					const sample = routeForecast[Number(cell.dataset.forecastIndex)];
					const dateTime = cell.querySelector('.forecast-date-time');
					if (!sample || !dateTime) return;
					dateTime.innerHTML = `<small>${dateFormat.format(sample.eta)}</small><b>${formatWaypointHour(sample.eta)}</b>`;
				});

			const distances = [0];

			for (let index = 1; index < points.length; index++) {
				distances.push(distances[index - 1] + haversineNm(points[index - 1], points[index]));
			}

			const totalDistance = distances[distances.length - 1] || 0;
			const visibleIndices = points.map((_, index) => index).filter(index => !liveRouteActive || index !== 0);

			forecastDrawer.querySelectorAll('.route-waypoint-dot').forEach((dot, dotIndex) => {
				const index = visibleIndices[dotIndex];
				if (index === undefined) return;
				const number = waypointNumber(index);

				const name = index === 0
				? 'Inicio'
				: index === points.length - 1
					? 'Destino'
					: `Intermedio ${index}`;

				dot.style.left = `${totalDistance > 0
			? distances[index] / totalDistance * 100
			: 50}%`;

				dot.title = `P${number} · ${name}`;
				dot.textContent = String(number);
			});

			updateQuickDepartureFields(timestamp);
		}

		function saveRoute() {
			if (liveRouteActive) return;

			try {
				const serialized = JSON.stringify({
					version: 1,
					points,
					nextPointId,
					departureDateTime,
					speedKnots
				});

				localStorage.setItem(routeStorageKey, serialized);
				localStorage.setItem(routeStorageBackupKey, serialized);
			} catch(/* Keep the current route for this session if storage is unavailable. */ _a) {
				
			} /* Keep the current route for this session if storage is unavailable. */
		}

		function restoreRoute() {
			try {
				const snapshot = parseRouteSnapshot(localStorage.getItem(routeStorageKey)) || parseRouteSnapshot(localStorage.getItem(routeStorageBackupKey));
				if (!snapshot) return false;
				$$invalidate(0, points = snapshot.points);
				nextPointId = snapshot.nextPointId;

				if (snapshot.departureDateTime) {
					departureDateTime = snapshot.departureDateTime;
					restoredDepartureTimestamp = new Date(snapshot.departureDateTime).getTime();
					recenterDepartureTimeline = true;
				}

				if (snapshot.speedKnots) speedKnots = snapshot.speedKnots;
				return true;
			} catch(_a) {
				return false;
			}
		}

		function saveRouteSnapshot(slot) {
			if (!liveRouteActive && points.length === 0) {
				$$invalidate(2, forecastMessage = 'No hay una ruta para guardar.');
				renderForecastDrawer();
				return;
			}

			const savedPoints = liveRouteActive
			? buildLiveRouteSnapshot(livePastWaypoints, points, navigationFix, navigationTargetId, Date.now())
			: points;

			if (!savedPoints) {
				updateForecastStatus('No se pudo guardar: espera una posición GPS reciente y un próximo waypoint válido.');
				return;
			}

			try {
				localStorage.setItem(routeSnapshotKeys[slot], JSON.stringify({
					version: 1,
					points: savedPoints,
					nextPointId: Math.max(nextPointId, ...savedPoints.map(point => point.id + 1)),
					departureDateTime,
					speedKnots
				}));

				routeSnapshotActions[slot] = 'load';
				$$invalidate(2, forecastMessage = `Ruta ${slot + 1} guardada en el plugin.`);
				renderForecastDrawer();
			} catch(_a) {
				$$invalidate(2, forecastMessage = 'No se pudo guardar la ruta en el almacenamiento del navegador.');
				renderForecastDrawer();
			}
		}

		function loadRouteSnapshot(slot) {
			let snapshot = null;

			try {
				snapshot = parseRouteSnapshot(localStorage.getItem(routeSnapshotKeys[slot]));
			} catch(/* Storage can be unavailable in private browsing. */ _a) {
				
			} /* Storage can be unavailable in private browsing. */

			if (!snapshot) {
				$$invalidate(2, forecastMessage = `No hay una ruta guardada válida en el espacio ${slot + 1}.`);
				routeSnapshotActions[slot] = 'save';
				renderForecastDrawer();
				return;
			}

			if (liveRouteActive) {
				const now = Date.now();
				const fix = navigationFix;
				const fixIsCurrent = !!fix && fix.timestamp <= now && now - fix.timestamp <= 30000 && hasValidCoordinates(fix.lat, fix.lon);
				const currentSpeed = currentRouteSpeed(liveAverageSpeed(recentGpsSpeeds, now, liveSpeedSeconds * 1000));

				if (!fixIsCurrent || currentSpeed === null || snapshot.points.length < 2) {
					updateForecastStatus(!fixIsCurrent
					? 'No se pudo cargar en VIVO: espera una posición GPS reciente.'
					: currentSpeed === null
						? 'No se pudo cargar en VIVO: espera una velocidad GPS válida.'
						: 'No se pudo cargar en VIVO: la ruta necesita al menos dos waypoints.');

					return;
				}

				const targetIndex = chooseNextWaypoint(fix, snapshot.points);

				if (targetIndex < 0 || targetIndex >= snapshot.points.length) {
					updateForecastStatus('No se pudo ubicar la posición actual en la ruta cargada.');
					return;
				}

				const loadedPoints = snapshot.points.map(point => Object.assign({}, point));
				liveOriginalWaypointNumbers = new Map(loadedPoints.map((point, index) => [point.id, index + 1]));
				livePastWaypoints = loadedPoints.slice(0, targetIndex).map((point, index) => ({ point, number: index + 1 }));
				const boatPointId = Math.max(snapshot.nextPointId, nextPointId, ...loadedPoints.map(point => point.id + 1));

				$$invalidate(0, points = [
					{
						id: boatPointId,
						lat: fix.lat,
						lon: fix.lon
					},
					...loadedPoints.slice(targetIndex)
				]);

				nextPointId = boatPointId + 1;
				navigationTargetId = loadedPoints[targetIndex].id;
				waypointArrivalConfirmations = 0;
				liveDisplayPoints = null;
				liveRouteUpdatedAt = now;
				speedKnots = currentSpeed;
				departureDateTime = toLocalDateTimeInput(new Date(now));
				restoredDepartureTimestamp = new Date(departureDateTime).getTime();
				recenterDepartureTimeline = true;

				try {
					localStorage.setItem('route-builder-speed-knots', String(speedKnots));
				} catch(/* Keep the live speed for this session. */ _b) {
					
				} /* Keep the live speed for this session. */

				recalculate(true);
				restartLiveTimers();
				return;
			}

			$$invalidate(0, points = snapshot.points);
			nextPointId = snapshot.nextPointId;
			navigationTargetId = null;
			waypointArrivalConfirmations = 0;
			const departure = restoredDeparture(snapshot.departureDateTime);
			departureDateTime = toLocalDateTimeInput(new Date(departure));
			restoredDepartureTimestamp = departure;
			recenterDepartureTimeline = true;

			if (snapshot.speedKnots) {
				speedKnots = snapshot.speedKnots;

				try {
					localStorage.setItem('route-builder-speed-knots', String(speedKnots));
				} catch(/* Current session still uses the restored speed. */ _c) {
					
				} /* Current session still uses the restored speed. */
			}

			recalculate(true);
		}

		function leaveLiveRoute(restorePreviousRoute = false, clearNavigationBackup = true) {
			let snapshot = null;
			let restorePreviousWarning = false;

			if (restorePreviousRoute) {
				snapshot = navigationPlanBackupActive
				? loadTemporaryPlan(localStorage, parseRouteSnapshot)
				: null;

				if (!snapshot || !snapshot.departureDateTime || !snapshot.speedKnots) {
					snapshot = null;
					restorePreviousRoute = false;
					restorePreviousWarning = true;
				}
			}

			let preservedPoints = null;

			if (!restorePreviousRoute && liveRouteActive) {
				preservedPoints = points.length
				? buildLiveRoutePoints(livePastWaypoints, points, navigationTargetId, points[0])
				: [];

				if (!preservedPoints) {
					updateForecastStatus('No se pudo conservar la ruta actual. Comprueba que tenga un próximo waypoint válido.');
					return false;
				}
			}

			if (snapshot) {
				$$invalidate(0, points = snapshot.points);
				nextPointId = snapshot.nextPointId;
				departureDateTime = snapshot.departureDateTime;
				restoredDepartureTimestamp = new Date(departureDateTime).getTime();
				recenterDepartureTimeline = true;
				speedKnots = snapshot.speedKnots;
			} else if (preservedPoints) {
				$$invalidate(0, points = preservedPoints);
				nextPointId = Math.max(nextPointId, ...preservedPoints.map(point => point.id + 1));
				const departure = new Date(departureDateTime).getTime();
				restoredDepartureTimestamp = Number.isFinite(departure) ? departure : null;
				recenterDepartureTimeline = true;
			}

			navigationTargetId = null;
			waypointArrivalConfirmations = 0;
			liveRouteActive = false;
			liveRouteUpdatedAt = 0;
			livePastWaypoints = [];
			liveOriginalWaypointNumbers.clear();

			pastWaypointLayer === null || pastWaypointLayer === void 0
			? void 0
			: pastWaypointLayer.removeFrom(map);

			pastWaypointLayer = null;

			pastRouteLine === null || pastRouteLine === void 0
			? void 0
			: pastRouteLine.removeFrom(map);

			pastRouteLine = null;
			liveDisplayPoints = null;
			if (liveRefreshTimer !== null) window.clearInterval(liveRefreshTimer);
			liveRefreshTimer = null;
			if (liveWaypointTimer !== null) window.clearInterval(liveWaypointTimer);
			liveWaypointTimer = null;

			liveButton === null || liveButton === void 0
			? void 0
			: liveButton.setAttribute('aria-pressed', 'false');

			recalculate(true);

			if (clearNavigationBackup) {
				clearTemporaryPlan(localStorage);
				navigationPlanBackupActive = false;
			}

			if (restorePreviousWarning) updateForecastStatus('No se encontró la ruta anterior; se conservó la ruta actual.');
			return true;
		}

		function enterLiveRoute() {
			const fix = navigationFix;
			const now = Date.now();
			const targetIndex = points.findIndex(point => point.id === navigationTargetId);

			if (!fix || now - fix.timestamp > 30000 || fix.timestamp > now || targetIndex < 0 || points.length < 2) {
				updateForecastStatus('Se necesita una posición GPS reciente y una ruta con próximo waypoint.');
				return;
			}

			const currentSpeed = currentRouteSpeed(liveAverageSpeed(recentGpsSpeeds, now, liveSpeedSeconds * 1000));

			if (currentSpeed === null) {
				updateForecastStatus('Se necesita una velocidad GPS reciente de al menos 0,1 kt para activar EN VIVO.');
				return;
			}

			if (!navigationPlanBackupActive) {
				if (!saveTemporaryPlan(localStorage, {
					points,
					nextPointId,
					departureDateTime,
					speedKnots
				})) {
					updateForecastStatus('No se pudo guardar la ruta anterior; EN VIVO no se activó.');
					return;
				}

				navigationPlanBackupActive = true;
			}

			if (departureScrollCommitTimer !== null) {
				window.clearTimeout(departureScrollCommitTimer);
				departureScrollCommitTimer = null;
			}

			const destinationId = points[targetIndex].id;
			liveOriginalWaypointNumbers = new Map(points.map((point, index) => [point.id, index + 1]));

			livePastWaypoints = points.slice(0, targetIndex).map((point, index) => ({
				point: Object.assign({}, point),
				number: index + 1
			}));

			$$invalidate(0, points = [
				{
					id: nextPointId++,
					lat: fix.lat,
					lon: fix.lon
				},
				...points.slice(targetIndex).map(point => Object.assign({}, point))
			]);

			speedKnots = currentSpeed;
			departureDateTime = toLocalDateTimeInput(new Date(now));
			restoredDepartureTimestamp = new Date(departureDateTime).getTime();
			recenterDepartureTimeline = true;
			navigationTargetId = destinationId;
			waypointArrivalConfirmations = 0;
			liveRouteActive = true;
			liveRouteUpdatedAt = now;

			liveButton === null || liveButton === void 0
			? void 0
			: liveButton.setAttribute('aria-pressed', 'true');

			recalculate(true);
			restartLiveTimers();
		}

		function tryStartAutomaticLive() {
			if (!autoLivePending || !navigationActive || liveRouteActive || !navigationFix || points.length < 2) return;
			const now = Date.now();
			if (navigationFix.timestamp > now || now - navigationFix.timestamp > 30000 || points.findIndex(point => point.id === navigationTargetId) < 0 || currentRouteSpeed(liveAverageSpeed(recentGpsSpeeds, now, liveSpeedSeconds * 1000)) === null) return;
			autoLivePending = false;
			enterLiveRoute();
		}

		function restartLiveTimers() {
			if (liveRefreshTimer !== null) window.clearInterval(liveRefreshTimer);
			if (liveWaypointTimer !== null) window.clearInterval(liveWaypointTimer);
			liveRefreshTimer = null;
			liveWaypointTimer = null;
			if (!liveRouteActive) return;
			liveRefreshTimer = window.setInterval(refreshLiveRoute, liveForecastSeconds * 1000);
			liveWaypointTimer = window.setInterval(refreshLiveWaypoints, liveWaypointSeconds * 1000);
		}

		function refreshLiveWaypoints() {
			if (!liveRouteActive || !navigationActive || !navigationFix || Date.now() - navigationFix.timestamp > 30000 || points.length < 2) return;
			const targetIndex = points.findIndex(point => point.id === navigationTargetId);
			if (targetIndex < 1) return;

			if (targetIndex > 1 && !forecastBusy) {
				refreshLiveRoute();
				return;
			}

			if (!forecastBusy) refreshLiveRoute(false);
		}

		function refreshLiveRoute(updateForecast = true) {
			if (!liveRouteActive || !navigationActive || forecastBusy) return;
			const now = Date.now();
			const averageSpeed = liveAverageSpeed(recentGpsSpeeds, now, liveSpeedSeconds * 1000);

			const next = prepareLiveRefresh(
				navigationFix
				? Object.assign(Object.assign({}, navigationFix), { speed: averageSpeed })
				: null,
				points,
				navigationTargetId,
				now
			);

			if (!next) {
				updateForecastStatus('EN VIVO sin actualizar: espera una posición y velocidad GPS válidas.');
				return;
			}

			const targetIndex = points.findIndex(point => point.id === navigationTargetId);
			const knownPastIds = new Set(livePastWaypoints.map(entry => entry.point.id));

			for (const point of points.slice(1, targetIndex)) {
				const number = liveOriginalWaypointNumbers.get(point.id);

				if (number !== undefined && !knownPastIds.has(point.id)) {
					livePastWaypoints.push({ point: Object.assign({}, point), number });
					knownPastIds.add(point.id);
				}
			}

			$$invalidate(0, points = next.points);
			liveDisplayPoints = null;
			speedKnots = next.speed;
			liveRouteUpdatedAt = now;
			departureDateTime = toLocalDateTimeInput(new Date(now));
			restoredDepartureTimestamp = new Date(departureDateTime).getTime();
			recenterDepartureTimeline = true;
			if (updateForecast) forecastDataCache.clear(); else updateLiveForecastSampleTimes(now);
			recalculate(updateForecast, !updateForecast);

			if (!updateForecast && (forecastDrawer === null || forecastDrawer === void 0
			? void 0
			: forecastDrawer.classList.contains('is-open'))) updateLiveDrawerTimes(now);
		}

		function updateLiveForecastSampleTimes(baseTimestamp) {
			if (!routeForecast.length || points.length < 2) return;
			const cumulative = [0];

			for (let index = 1; index < points.length; index++) {
				cumulative.push(cumulative[index - 1] + haversineNm(points[index - 1], points[index]));
			}

			const speed = Math.max(0.1, speedKnots);

			for (const sample of routeForecast) {
				let closestDistance = 0;
				let closestOffset = Number.POSITIVE_INFINITY;

				for (let index = 1; index < points.length; index++) {
					const start = points[index - 1];
					const end = points[index];
					const referenceLat = (start.lat + end.lat + sample.lat) / 3 * Math.PI / 180;
					const longitudeScale = Math.max(1e-6, Math.cos(referenceLat));
					const dx = (end.lon - start.lon) * longitudeScale;
					const dy = end.lat - start.lat;
					const sampleX = (sample.lon - start.lon) * longitudeScale;
					const sampleY = sample.lat - start.lat;
					const lengthSquared = dx * dx + dy * dy;

					const fraction = lengthSquared > 1e-12
					? Math.max(0, Math.min(1, (sampleX * dx + sampleY * dy) / lengthSquared))
					: 0;

					const offset = Math.hypot(sampleX - dx * fraction, sampleY - dy * fraction);

					if (offset < closestOffset) {
						closestOffset = offset;
						closestDistance = cumulative[index - 1] + (cumulative[index] - cumulative[index - 1]) * fraction;
					}
				}

				sample.distanceNm = closestDistance;
				sample.eta = new Date(baseTimestamp + closestDistance / speed * 3600000);
			}
		}

		function recalculate(refreshForecast = false, preserveForecastPrefix = false) {
			calculateDistanceNm();
			updateNavigationPanel();
			invalidateForecast(preserveForecastPrefix);
			redrawMap();
			saveRoute();

			if (refreshForecast && points.length >= 2 && (forecastDrawer === null || forecastDrawer === void 0
			? void 0
			: forecastDrawer.classList.contains('is-open'))) {
				void calculateRouteForecast();
			} else if (points.length < 2 && (forecastDrawer === null || forecastDrawer === void 0
			? void 0
			: forecastDrawer.classList.contains('is-open'))) {
				$$invalidate(2, forecastMessage = 'Agrega al menos dos Waypoints para consultar el pronóstico.');
				renderForecastDrawer();
			}
		}

		function invalidateForecast(preserveRouteForecast = false) {
			forecastJob++;
			$$invalidate(1, forecastBusy = false);
			departureAnalysisBusy = false;
			departureEvaluations = [];
			if (!preserveRouteForecast) routeForecast = [];
			$$invalidate(2, forecastMessage = '');
			hideRouteForecastHighlight();
		}

		function calculateDistanceNm() {
			return points.slice(1).reduce(
				(sum, point, index) => {
					return sum + haversineNm(points[index], point);
				},
				0
			);
		}

		function calculateWaypointTimes(routePoints = points, departureTimestamp) {
			const departure = new Date(departureTimestamp !== null && departureTimestamp !== void 0
				? departureTimestamp
				: liveRouteActive && liveRouteUpdatedAt
					? liveRouteUpdatedAt
					: departureDateTime);

			if (!Number.isFinite(departure.getTime())) return [];
			let elapsedHours = 0;

			return routePoints.map((point, index) => {
				if (index > 0) elapsedHours += haversineNm(routePoints[index - 1], point) / Math.max(0.1, speedKnots);
				return new Date(departure.getTime() + elapsedHours * 3600000);
			});
		}

		function waypointNumber(index) {
			if (liveRouteActive) {
				if (index === 0) return 0;
				const point = points[index];

				if (point) {
					let number = liveOriginalWaypointNumbers.get(point.id);

					if (number === undefined) {
						number = Math.max(0, ...liveOriginalWaypointNumbers.values()) + 1;
						liveOriginalWaypointNumbers.set(point.id, number);
					}

					return number;
				}
			}

			return index + 1;
		}

		function renumberLiveWaypointInsertion(insertAt, newPointId) {
			if (!liveRouteActive || insertAt < 1 || insertAt >= points.length) return;
			const newNumber = waypointNumber(insertAt);

			const shifted = points.slice(insertAt).map((point, offset) => ({
				id: point.id,
				number: waypointNumber(insertAt + offset) + 1
			}));

			liveOriginalWaypointNumbers.set(newPointId, newNumber);
			for (const entry of shifted) liveOriginalWaypointNumbers.set(entry.id, entry.number);
			const targetIndex = points.findIndex(point => point.id === navigationTargetId);
			if (targetIndex >= insertAt) navigationTargetId = newPointId;
		}

		function updateNavigationPanel(freshFix = false) {
			var _a, _b, _c, _d;
			if (!navigationPanel) return;
			redrawGpsCourseLine();
			redrawWindIndicator();

			const fix = navigationFix && Date.now() - navigationFix.timestamp <= 30000
			? navigationFix
			: null;

			let index = points.findIndex(point => point.id === navigationTargetId);

			if (fix && index < 0 && points.length) {
				index = chooseNextWaypoint(fix, points);

				navigationTargetId = (_b = (_a = points[index]) === null || _a === void 0
				? void 0
				: _a.id) !== null && _b !== void 0
				? _b
				: null;

				waypointArrivalConfirmations = 0;
			}

			if (fix && freshFix && fix.timestamp > lastNavigationFixTimestamp && index >= 0) {
				lastNavigationFixTimestamp = fix.timestamp;
				const progress = advanceWaypoint(fix, points, index, waypointArrivalConfirmations);
				index = progress.index;
				waypointArrivalConfirmations = progress.confirmations;

				navigationTargetId = (_d = (_c = points[index]) === null || _c === void 0
				? void 0
				: _c.id) !== null && _d !== void 0
				? _d
				: null;
			}

			const waypointSelect = navigationPanel.querySelector('[data-nav-waypoint-select]');

			if (waypointSelect) {
				const signature = `${liveRouteActive}:${points.map(point => point.id).join(',')}`;

				if (waypointSelect.dataset.routeSignature !== signature) {
					waypointSelect.innerHTML = points.map((point, i) => liveRouteActive && i === 0
					? ''
					: `<option value="${point.id}">Waypoint ${waypointNumber(i)}</option>`).join('');

					waypointSelect.dataset.routeSignature = signature;
				}

				waypointSelect.disabled = !points.length;
				if (index >= 0) waypointSelect.value = String(points[index].id);
			}

			const metrics = fix
			? navigationMetrics(fix, points, index, fix.speed)
			: null;

			const averageSpeed = fix
			? averageRouteSpeed(fix, points, index, new Date(departureDateTime).getTime(), fix.timestamp)
			: null;

			const degrees = value => typeof value === 'number' && Number.isFinite(value)
			? `${String(Math.round(value) % 360).padStart(3, '0')}°`
			: '—';

			const distance = value => typeof value === 'number' && Number.isFinite(value)
			? `${value.toFixed(1)} Nm`
			: '—';

			const duration = value => typeof value === 'number' && Number.isFinite(value)
			? formatDuration(value)
			: '—';

			const eta = (metrics === null || metrics === void 0
			? void 0
			: metrics.hoursFinal) != null
			? formatTimelineDateTime(Date.now() + metrics.hoursFinal * 3600000).replace(' · ', ' ')
			: '—';

			const data = {
				waypoint: index >= 0
				? `Waypoint ${waypointNumber(index)}`
				: 'Waypoint',
				bearing: degrees(metrics === null || metrics === void 0
				? void 0
				: metrics.bearing),
				nextDistance: distance(metrics === null || metrics === void 0
				? void 0
				: metrics.distanceNext),
				nextTime: duration(metrics === null || metrics === void 0
				? void 0
				: metrics.hoursNext),
				speed: (fix === null || fix === void 0 ? void 0 : fix.speed) != null
				? fix.speed.toFixed(1)
				: '—',
				averageSpeed: averageSpeed !== null ? averageSpeed.toFixed(1) : '—',
				heading: degrees(fix === null || fix === void 0 ? void 0 : fix.heading),
				finalTime: duration(metrics === null || metrics === void 0
				? void 0
				: metrics.hoursFinal),
				finalDistance: distance(metrics === null || metrics === void 0
				? void 0
				: metrics.distanceFinal),
				eta
			};

			for (const [key, value] of Object.entries(data)) {
				const element = navigationPanel.querySelector(`[data-nav-value="${key}"]`);
				if (element) element.textContent = value;
			}

			updateBoatTrackMarker();
			redrawMapOverlays();
		}

		function updateBoatTrackMarker() {
			const marker = forecastDrawer === null || forecastDrawer === void 0
			? void 0
			: forecastDrawer.querySelector('.route-waypoint-boat');

			if (!marker) return;

			const fix = navigationFix && Date.now() - navigationFix.timestamp <= 30000
			? navigationFix
			: null;

			const index = points.findIndex(point => point.id === navigationTargetId);
			const progress = routeProgress(fix, points, index);
			marker.hidden = progress === null;
			if (progress !== null) marker.style.left = `${progress * 100}%`;
		}

		function highlightRouteForecast(index) {
			const sample = routeForecast[index];
			if (!sample) return;

			const icon = L.divIcon({
				className: 'route-builder-forecast-highlight-wrap',
				html: '<span class="route-builder-forecast-highlight"></span>',
				iconSize: [28, 28],
				iconAnchor: [14, 14]
			});

			if (!forecastHighlightMarker) forecastHighlightMarker = L.marker([sample.lat, sample.lon], {
				icon,
				interactive: false,
				zIndexOffset: 1200
			}).addTo(map); else forecastHighlightMarker.setLatLng([sample.lat, sample.lon]);

			forecastHighlightMarker.setIcon(icon);
			forecastHighlightMarker.setZIndexOffset(1200);
		}

		function hideRouteForecastHighlight() {
			forecastHighlightMarker === null || forecastHighlightMarker === void 0
			? void 0
			: forecastHighlightMarker.removeFrom(map);

			forecastHighlightMarker = null;

			if (hoverRestoreTimestamp !== null) {
				windyStore.set('timestamp', hoverRestoreTimestamp);
				hoverRestoreTimestamp = null;
				hoveredForecastTimestamp = null;
			}
		}

		function renderForecastDrawer() {
			var _a, _b, _c, _d, _e, _f, _g;
			if (!forecastDrawer) return;
			const visualAids = forecastDrawer.querySelector('.navigation-visual-aids');
			if (visualAids) visualAidsOpen = visualAids.open;
			const windSettings = forecastDrawer.querySelector('[data-visual-group="wind"]');
			const waveSettings = forecastDrawer.querySelector('[data-visual-group="wave"]');
			const laylineSettings = forecastDrawer.querySelector('[data-visual-group="laylines"]');
			const roseSettings = forecastDrawer.querySelector('[data-visual-group="rose"]');
			if (windSettings) windIndicatorSettingsOpen = windSettings.open;
			if (waveSettings) waveIndicatorSettingsOpen = waveSettings.open;
			if (laylineSettings) laylinesSettingsOpen = laylineSettings.open;
			if (roseSettings) windRoseSettingsOpen = roseSettings.open;
			applyForecastDrawerHeightLimit();

			const existingScroll = ((_a = forecastDrawer.querySelector('.forecast-table-scroll')) === null || _a === void 0
			? void 0
			: _a.scrollLeft) || 0;

			const pickerScroll = ((_b = forecastDrawer.querySelector('.forecast-field-picker')) === null || _b === void 0
			? void 0
			: _b.scrollTop) || 0;

			const previousTimebar = forecastDrawer.querySelector('.departure-timebar-scroll');

			const existingTimebarScroll = (_c = previousTimebar === null || previousTimebar === void 0
			? void 0
			: previousTimebar.scrollLeft) !== null && _c !== void 0
			? _c
			: departureTimelineScrollLeft;

			const routeDurationHours = points.slice(1).reduce((hours, point, index) => hours + haversineNm(points[index], point) / Math.max(0.1, speedKnots), 0);
			const departureSlots = candidateDepartureTimes().map(departure => departure.getTime());

			(_d = departureSlots[0]) !== null && _d !== void 0
			? _d
			: Math.floor(Date.now() / 60000) * 60000;

			const minDeparture = earliestDeparture(new Date(), restoredDepartureTimestamp);

			const maxDeparture = Math.max(
				(_e = departureSlots[departureSlots.length - 1]) !== null && _e !== void 0
				? _e
				: minDeparture + 24 * 3600000,
				minDeparture,
				restoredDepartureTimestamp !== null && restoredDepartureTimestamp !== void 0
				? restoredDepartureTimestamp
				: minDeparture
			);

			const actualDeparture = new Date(departureDateTime).getTime();

			const selectedDeparture = restoredDepartureTimestamp !== null && actualDeparture === restoredDepartureTimestamp
			? restoredDepartureTimestamp
			: snapDepartureTimestamp(
					Number.isFinite(actualDeparture)
					? actualDeparture
					: minDeparture,
					minDeparture,
					maxDeparture
				);

			const alignedDepartureValue = toLocalDateTimeInput(new Date(selectedDeparture));

			if (departureDateTime !== alignedDepartureValue) {
				departureDateTime = alignedDepartureValue;
				saveRoute();
			}

			const pixelsPerHour = 10;
			const timelineStartDate = new Date(minDeparture);
			timelineStartDate.setHours(0, 0, 0, 0);
			timelineStartDate.setDate(timelineStartDate.getDate() - 7);
			const timelineStart = timelineStartDate.getTime();
			const latestArrival = maxDeparture + routeDurationHours * 3600000;
			const timelineEndDate = new Date(latestArrival);
			timelineEndDate.setHours(24, 0, 0, 0);
			const timelineEnd = timelineEndDate.getTime();

			const timelinePadding = Math.ceil(Math.max(
				window.innerWidth,
				((_f = window.screen) === null || _f === void 0
				? void 0
				: _f.width) || 0,
				((_g = window.screen) === null || _g === void 0
				? void 0
				: _g.height) || 0
			) / 2) + 8;

			const timelineX = timestamp => timelinePadding + (timestamp - timelineStart) / 3600000 * pixelsPerHour;
			const timebarWidth = Math.ceil(timelineX(timelineEnd) + timelinePadding);
			const formatTimelineDate = timestamp => new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric' }).format(new Date(timestamp)).replace('.', '');
			const formatCompactDate = date => new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit' }).format(date);
			const dayBands = [];
			const hourTicks = [];
			let dayStart = new Date(timelineStart);
			dayStart.setHours(0, 0, 0, 0);

			while (dayStart.getTime() < timelineEnd) {
				const currentDayStart = dayStart.getTime();
				const nextDay = new Date(dayStart);
				nextDay.setDate(nextDay.getDate() + 1);
				nextDay.setHours(0, 0, 0, 0);
				const bandWidth = (nextDay.getTime() - currentDayStart) / 3600000 * pixelsPerHour;
				dayBands.push(`<span class="departure-day-band" style="left:${timelineX(currentDayStart)}px;width:${bandWidth}px">${formatTimelineDate(currentDayStart)}</span>`);

				for (let hour = 0; hour < 24; hour += Math.max(1, departureIntervalHours)) {
					const tickDate = new Date(currentDayStart);
					tickDate.setHours(hour, 0, 0, 0);
					const tickTime = tickDate.getTime();

					if (tickTime <= latestArrival) {
						const label = hour === 0 || hour % 3 === 0
						? `<small>${String(hour).padStart(2, '0')}</small>`
						: '';

						hourTicks.push(`<span class="departure-hour-tick" style="left:${timelineX(tickTime)}px"><i></i>${label}</span>`);
					}
				}

				dayStart = nextDay;
			}

			const selectedPosition = timelineX(selectedDeparture);
			const arrivalTimestamp = selectedDeparture + routeDurationHours * 3600000;

			const cells = (render, colorize) => {
				const palette = colorize
				? routeForecast.map(sample => colorize(sample) || '#e9eded')
				: [];

				return routeForecast.map((sample, index) => {
					const color = palette[index];
					const leftColor = index > 0 ? palette[index - 1] : color;
					const rightColor = index < palette.length - 1 ? palette[index + 1] : color;

					const style = color
					? `background:linear-gradient(90deg,${mixForecastColors(leftColor, color)} 0%,${color} 50%,${mixForecastColors(color, rightColor)} 100%);color:${forecastTextColor(color)};`
					: '';

					return `<td data-column-index="${index + 4}" data-forecast-index="${index}"${style ? ` style="${style}"` : ''}>${render(sample)}<span class="forecast-column-resize-handle" data-resize-column="${index + 4}" role="separator" tabindex="0" aria-label="Redimensionar columna de pronóstico ${index + 1}" title="Arrastrar para cambiar el ancho"></span></td>`;
				}).join('');
			};

			const statCell = (label, value, suffix = '', decimals = 0, resizeColumn, columnIndex, bearing) => {
				var _a;

				const rendered = value === null || typeof value === 'number' && !Number.isFinite(value)
				? '—'
				: typeof value === 'number'
					? `${value.toFixed(decimals)}${suffix}`
					: value;

				const arrow = typeof bearing === 'number' && Number.isFinite(bearing) && value !== null
				? `<span class="forecast-arrow" style="transform:rotate(${bearing + 90}deg)">➤</span>`
				: '';

				const index = (_a = columnIndex !== null && columnIndex !== void 0
				? columnIndex
				: resizeColumn) !== null && _a !== void 0
				? _a
				: 1;

				const resizeHandle = `<span class="forecast-column-resize-handle" data-resize-column="${index}" role="separator" tabindex="0" aria-label="Redimensionar columna ${label}" title="Arrastrar para cambiar el ancho"></span>`;
				return `<td class="forecast-stat-cell" data-column-index="${index}"><small>${label}</small><b>${arrow}${rendered}</b>${resizeHandle}</td>`;
			};

			const circularBearing = directions => {
				if (!directions.length) return null;
				const x = directions.reduce((sum, angle) => sum + Math.cos(angle * Math.PI / 180), 0);
				const y = directions.reduce((sum, angle) => sum + Math.sin(angle * Math.PI / 180), 0);

				return Math.hypot(x, y) > 1e-10
				? averageDirection(directions)
				: null;
			};

			const statistics = (key, suffix = '', decimals = 0, circularMean = false, directionKey) => {
				var _a, _b;

				const values = routeForecast.map(sample => {
					var _a;

					return (_a = sample.values) === null || _a === void 0
					? void 0
					: _a[key];
				}).filter(value => value !== null && value !== undefined && Number.isFinite(value));

				if (!values.length) return statCell('Min', null, '', 0, undefined, 1) + statCell('Max', null, '', 0, undefined, 2) + statCell('Prom', null, '', 0, undefined, 3);
				const min = Math.min(...values), max = Math.max(...values);

				const mean = circularMean
				? averageDirection(values)
				: values.reduce((sum, value) => sum + value, 0) / values.length;

				const paired = directionKey
				? routeForecast.filter(sample => {
						var _a, _b;

						return typeof ((_a = sample.values) === null || _a === void 0
						? void 0
						: _a[key]) === 'number' && Number.isFinite(sample.values[key]) && typeof ((_b = sample.values) === null || _b === void 0
						? void 0
						: _b[directionKey]) === 'number' && Number.isFinite(sample.values[directionKey]);
					})
				: [];

				const minSample = directionKey
				? routeForecast.find(sample => {
						var _a;

						return ((_a = sample.values) === null || _a === void 0
						? void 0
						: _a[key]) === min;
					})
				: undefined;

				const maxSample = directionKey
				? routeForecast.find(sample => {
						var _a;

						return ((_a = sample.values) === null || _a === void 0
						? void 0
						: _a[key]) === max;
					})
				: undefined;

				const minBearing = circularMean
				? min
				: directionKey
					? (_a = minSample === null || minSample === void 0
						? void 0
						: minSample.values) === null || _a === void 0
						? void 0
						: _a[directionKey]
					: null;

				const maxBearing = circularMean
				? max
				: directionKey
					? (_b = maxSample === null || maxSample === void 0
						? void 0
						: maxSample.values) === null || _b === void 0
						? void 0
						: _b[directionKey]
					: null;

				const meanBearing = circularMean
				? circularBearing(values)
				: directionKey
					? circularBearing(paired.map(sample => sample.values[directionKey]))
					: null;

				return statCell('Min', min, suffix, decimals, undefined, 1, minBearing) + statCell('Max', max, suffix, decimals, undefined, 2, maxBearing) + statCell('Prom', mean, suffix, decimals, undefined, 3, meanBearing);
			};

			const groupWaveDirection = (field, sample) => {
				const directions = activeGroupFields(field).map(model => {
					var _a, _b;

					const height = (_a = sample.values) === null || _a === void 0
					? void 0
					: _a[model];

					const directionKey = field === 'wavesAverage'
					? model === 'waves' ? 'wavesDir' : 'ecmwfWavesDir'
					: model === 'swell1' ? 'swell1Dir' : 'ecmwfSwell1Dir';

					const bearing = (_b = sample.values) === null || _b === void 0
					? void 0
					: _b[directionKey];

					return typeof height === 'number' && Number.isFinite(height) && typeof bearing === 'number' && Number.isFinite(bearing)
					? bearing
					: null;
				}).filter(bearing => bearing !== null);

				return circularBearing(directions);
			};

			const skyStatistics = () => {
				const values = routeForecast.map(sample => {
					var _a;

					return (_a = sample.values) === null || _a === void 0
					? void 0
					: _a.clouds;
				}).filter(value => value !== null && value !== undefined && Number.isFinite(value)).map(value => value <= 1 ? value * 100 : value);

				if (!values.length) return statCell('Min', null, '', 0, undefined, 1) + statCell('Max', null, '', 0, undefined, 2) + statCell('Prom', null, '', 0, undefined, 3);
				const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
				return statCell('Min', Math.min(...values), '%', 0, undefined, 1) + statCell('Max', Math.max(...values), '%', 0, undefined, 2) + statCell('Prom', mean, '%', 0, undefined, 3);
			};

			const row = (label, render, colorize, stats = '', conditionKey) => {
				var _a;

				const configured = conditionKey
				? windowConditionConfigured(conditionKey)
				: false;

				const conditionStatus = conditionKey ? routeConditionResult(conditionKey) : null;
				const key = conditionKey || '';
				const group = additionalGroups[key];

				const modelPrefix = (_a = key.match(/^(ecmwf|mblue|icon|arome)(Temperature|Feels|Rain|Gust|Dew|Sky)$/)) === null || _a === void 0
				? void 0
				: _a[1];

				const extraModelInfo = {
					ecmwf: ['ECMWF · 9 km', 'is-ecmwf'],
					mblue: ['mBlue AI · global', 'is-mblue'],
					icon: ['ICON · 13 km', 'is-icon'],
					arome: ['AROME Antillas · 2.5 km', 'is-arome']
				};

				const modelInfo = modelPrefix
				? extraModelInfo[modelPrefix]
				: group
					? [
							`${key === 'skyAverage' ? 'Predominante' : 'Promedio'} · ${activeGroupFields(key).length} modelos`,
							'is-wind-average'
						]
					: key === 'arrival'
						? null
						: key === 'windAverage'
							? [
									`Promedio · ${activeWindModelFields().length} modelos`,
									'is-wind-average'
								]
							: ['ecmwfWind', 'ecmwfWindDirection'].includes(key)
								? ['ECMWF · 9 km', 'is-ecmwf']
								: ['mblueWind', 'mblueWindDirection'].includes(key)
									? ['mBlue AI · global', 'is-mblue']
									: ['iconWind', 'iconWindDirection'].includes(key)
										? ['ICON · 13 km', 'is-icon']
										: ['aromeWind', 'aromeWindDirection'].includes(key)
											? ['AROME · 2.5 km', 'is-arome']
											: ['current', 'currentTide'].includes(key)
												? ['CMEMS · 8 km', 'is-cmems']
												: [
														'ecmwfWaves',
														'ecmwfSwell1',
														'ecmwfSwell1Period',
														'ecmwfWavesPeriod',
														'ecmwfWavesPower'
													].includes(key)
													? ['ECMWF WAM', 'is-ecmwf-waves']
													: [
															'waves',
															'swell1',
															'swell1Period',
															'swell2',
															'swell2Period',
															'windWaves',
															'windWavesPeriod',
															'wavesPeriod',
															'wavesPower'
														].includes(key)
														? ['GFS Waves · 0.25°', 'is-gfs-waves']
														: ['wind', 'gust', 'direction'].includes(key)
															? ['GFS · global', 'is-gfs']
															: ['GFS · global', 'is-gfs'];

				const modelBadge = modelInfo
				? `<span class="forecast-model-badge ${modelInfo[1]}">${modelInfo[0]}</span>`
				: '';

				const windToggle = group
				? `<button type="button" class="forecast-wind-group-toggle" data-group-toggle="${key}" aria-expanded="${collapsedGroups[key] === false}" aria-label="${collapsedGroups[key] === false ? 'Plegar' : 'Desplegar'} modelos">${collapsedGroups[key] === false ? '▾' : '▸'}</button>`
				: key === 'windAverage'
					? `<button type="button" class="forecast-wind-group-toggle" data-wind-models-toggle aria-expanded="${!windModelRowsCollapsed}" aria-label="${windModelRowsCollapsed ? 'Desplegar' : 'Plegar'} pronósticos de viento por modelo" title="${windModelRowsCollapsed
					? 'Desplegar modelos'
					: 'Plegar modelos'}">${windModelRowsCollapsed ? '▸' : '▾'}</button>`
					: '';

				const removeButton = group
				? `<button type="button" class="forecast-field-remove" data-route-field-remove="${key}" aria-label="Eliminar grupo ${label} y sus modelos" title="Eliminar todos los modelos del grupo">×</button>`
				: key === 'windAverage'
					? `<button type="button" class="forecast-field-remove" data-route-field-remove="windAverage" aria-label="Eliminar el grupo de viento y todos sus modelos" title="Eliminar todos los modelos del grupo">×</button>`
					: `<button type="button" class="forecast-field-remove" data-route-field-remove="${conditionKey}" aria-label="Ocultar ${label}" title="Ocultar campo">×</button>`;

				const rowLabel = conditionKey
				? `<span class="forecast-condition-row-label"><span class="forecast-field-drag" aria-hidden="true">⠿</span><span class="forecast-field-meta"><span class="forecast-field-name">${label}</span>${modelBadge}</span>${windToggle}<button type="button" class="window-condition-open${configured ? ' is-configured' : ''}${conditionStatus === true
				? ' is-pass'
				: conditionStatus === false ? ' is-fail' : ''}" data-window-condition="${conditionKey}" aria-label="Configurar condición de ${label}" title="Configurar condición">⚙</button>${removeButton}</span>`
				: label;

				return `<tr${conditionKey
			? ` class="forecast-field-row" draggable="true" data-route-field-row="${conditionKey}"`
			: colorize ? ' class="forecast-scale-row"' : ''}><th class="forecast-row-label" data-column-index="0">${rowLabel}<span class="forecast-column-resize-handle" data-resize-column="0" role="separator" tabindex="0" aria-label="Redimensionar columna de nombres de campo" title="Arrastrar para cambiar el ancho"></span></th>${stats}${cells(render, colorize)}</tr>`;
			};

			const direction = sample => {
				var _a, _b;

				return ((_a = sample.values) === null || _a === void 0
				? void 0
				: _a.direction) === null || ((_b = sample.values) === null || _b === void 0
				? void 0
				: _b.direction) === undefined
				? '—'
				: `<span class="forecast-arrow" style="transform:rotate(${sample.values.direction + 90}deg)">➤</span>${Math.round(sample.values.direction)}°`;
			};

			const directionFor = (sample, key) => {
				var _a;

				const bearing = (_a = sample.values) === null || _a === void 0
				? void 0
				: _a[key];

				return bearing === null || bearing === undefined
				? '—'
				: `<span class="forecast-arrow" style="transform:rotate(${bearing + 90}deg)">➤</span>${Math.round(bearing)}°`;
			};

			const waveValue = (sample, heightKey, directionKey) => {
				var _a, _b;

				const height = (_a = sample.values) === null || _a === void 0
				? void 0
				: _a[heightKey];

				const bearing = (_b = sample.values) === null || _b === void 0
				? void 0
				: _b[directionKey];

				if (height === null || height === undefined) return '—';

				const arrow = bearing === null || bearing === undefined
				? ''
				: `<span class="forecast-arrow" style="transform:rotate(${bearing + 90}deg)">➤</span>`;

				return `${arrow}${Number(height).toFixed(1)}`;
			};

			const directionalValue = (sample, valueKey, directionKey, decimals = 1) => {
				var _a, _b;

				const value = (_a = sample.values) === null || _a === void 0
				? void 0
				: _a[valueKey];

				const bearing = (_b = sample.values) === null || _b === void 0
				? void 0
				: _b[directionKey];

				if (value === null || value === undefined) return '—';

				const arrow = bearing === null || bearing === undefined
				? ''
				: `<span class="forecast-arrow" style="transform:rotate(${bearing + 90}deg)">➤</span>`;

				return `${arrow}${Number(value).toFixed(decimals)}`;
			};

			const departureStats = routeForecast.length
			? statCell('Inicio', formatTimelineDateTime(routeForecast[0].eta.getTime()), '', 0, 1) + statCell('Fin', formatTimelineDateTime(arrivalTimestamp), '', 0, 2) + statCell('Duración', formatDuration(routeDurationHours), '', 0, 3)
			: statCell('Inicio', null, '', 0, 1) + statCell('Fin', null, '', 0, 2) + statCell('Duración', null, '', 0, 3);

			const routeFieldAddControl = renderRouteFieldAddControl();

			const routeRows = Object.assign(
				Object.assign(
					{
						gfsDew: row('Punto de rocío', sample => forecastValue(sample, 'gfsDew', 1), undefined, statistics('gfsDew', ' °C', 1), 'gfsDew'),
						ecmwfDew: row('Punto de rocío', sample => forecastValue(sample, 'ecmwfDew', 1), undefined, statistics('ecmwfDew', ' °C', 1), 'ecmwfDew'),
						mblueDew: row('Punto de rocío', sample => forecastValue(sample, 'mblueDew', 1), undefined, statistics('mblueDew', ' °C', 1), 'mblueDew'),
						iconDew: row('Punto de rocío', sample => forecastValue(sample, 'iconDew', 1), undefined, statistics('iconDew', ' °C', 1), 'iconDew'),
						aromeDew: row('Punto de rocío', sample => forecastValue(sample, 'aromeDew', 1), undefined, statistics('aromeDew', ' °C', 1), 'aromeDew'),
						ecmwfTemperature: row('Temperatura', sample => forecastValue(sample, 'ecmwfTemperature', 1), undefined, statistics('ecmwfTemperature', ' °C', 1), 'ecmwfTemperature'),
						mblueTemperature: row('Temperatura', sample => forecastValue(sample, 'mblueTemperature', 1), undefined, statistics('mblueTemperature', ' °C', 1), 'mblueTemperature'),
						iconTemperature: row('Temperatura', sample => forecastValue(sample, 'iconTemperature', 1), undefined, statistics('iconTemperature', ' °C', 1), 'iconTemperature'),
						aromeTemperature: row('Temperatura', sample => forecastValue(sample, 'aromeTemperature', 1), undefined, statistics('aromeTemperature', ' °C', 1), 'aromeTemperature'),
						ecmwfFeels: row('Sens. térmica', sample => forecastValue(sample, 'ecmwfFeels', 1), undefined, statistics('ecmwfFeels', ' °C', 1), 'ecmwfFeels'),
						mblueFeels: row('Sens. térmica', sample => forecastValue(sample, 'mblueFeels', 1), undefined, statistics('mblueFeels', ' °C', 1), 'mblueFeels'),
						iconFeels: row('Sens. térmica', sample => forecastValue(sample, 'iconFeels', 1), undefined, statistics('iconFeels', ' °C', 1), 'iconFeels'),
						aromeFeels: row('Sens. térmica', sample => forecastValue(sample, 'aromeFeels', 1), undefined, statistics('aromeFeels', ' °C', 1), 'aromeFeels'),
						ecmwfRain: row('Lluvia', sample => forecastValue(sample, 'ecmwfRain', 2), undefined, statistics('ecmwfRain', ' in', 2), 'ecmwfRain'),
						mblueRain: row('Lluvia', sample => forecastValue(sample, 'mblueRain', 2), undefined, statistics('mblueRain', ' in', 2), 'mblueRain'),
						iconRain: row('Lluvia', sample => forecastValue(sample, 'iconRain', 2), undefined, statistics('iconRain', ' in', 2), 'iconRain'),
						aromeRain: row('Lluvia', sample => forecastValue(sample, 'aromeRain', 2), undefined, statistics('aromeRain', ' in', 2), 'aromeRain'),
						ecmwfGust: row(
							'Rachas',
							sample => forecastValue(sample, 'ecmwfGust', 0),
							sample => {
								var _a;

								return forecastColorStyle(
									'wind',
									(_a = sample.values) === null || _a === void 0
									? void 0
									: _a.ecmwfGust,
									1 / 1.94384
								);
							},
							statistics('ecmwfGust', ' kt', 0),
							'ecmwfGust'
						),
						mblueGust: row(
							'Rachas',
							sample => forecastValue(sample, 'mblueGust', 0),
							sample => {
								var _a;

								return forecastColorStyle(
									'wind',
									(_a = sample.values) === null || _a === void 0
									? void 0
									: _a.mblueGust,
									1 / 1.94384
								);
							},
							statistics('mblueGust', ' kt', 0),
							'mblueGust'
						),
						iconGust: row(
							'Rachas',
							sample => forecastValue(sample, 'iconGust', 0),
							sample => {
								var _a;

								return forecastColorStyle(
									'wind',
									(_a = sample.values) === null || _a === void 0
									? void 0
									: _a.iconGust,
									1 / 1.94384
								);
							},
							statistics('iconGust', ' kt', 0),
							'iconGust'
						),
						aromeGust: row(
							'Rachas',
							sample => forecastValue(sample, 'aromeGust', 0),
							sample => {
								var _a;

								return forecastColorStyle(
									'wind',
									(_a = sample.values) === null || _a === void 0
									? void 0
									: _a.aromeGust,
									1 / 1.94384
								);
							},
							statistics('aromeGust', ' kt', 0),
							'aromeGust'
						),
						feels: row('Sens. térmica', sample => forecastValue(sample, 'feels', 1), undefined, statistics('feels', ' °C', 1), 'feels')
					},
					Object.fromEntries(Object.entries(additionalGroups).map(([key, group]) => {
						const field = key;

						if (field === 'skyAverage') {
							const stats = statCell('Min', null, '', 0, undefined, 1) + statCell('Max', null, '', 0, undefined, 2) + statCell('Prom', null, '', 0, undefined, 3);

							return [
								field,
								row('Cielo', sample => skyFieldIcon(field, sample.values), undefined, stats, field)
							];
						}

						const values = routeForecast.map(sample => groupValue(field, sample.values)).filter(value => value !== null);

						const mean = group.circular
						? averageDirection(values)
						: values.length
							? values.reduce((a, b) => a + b, 0) / values.length
							: null;

						const min = values.length ? Math.min(...values) : null,
							max = values.length ? Math.max(...values) : null;

						const waveGroup = field === 'swell1Average' || field === 'wavesAverage';

						const minSample = waveGroup
						? routeForecast.find(sample => groupValue(field, sample.values) === min)
						: undefined;

						const maxSample = waveGroup
						? routeForecast.find(sample => groupValue(field, sample.values) === max)
						: undefined;

						const groupDirections = waveGroup
						? routeForecast.filter(sample => groupValue(field, sample.values) !== null).map(sample => groupWaveDirection(field, sample)).filter(value => value !== null)
						: [];

						const stats = statCell('Min', min, group.unit, group.decimals, undefined, 1, group.circular
						? min
						: minSample ? groupWaveDirection(field, minSample) : null) + statCell('Max', max, group.unit, group.decimals, undefined, 2, group.circular
						? max
						: maxSample ? groupWaveDirection(field, maxSample) : null) + statCell('Prom', mean, group.unit, group.decimals, undefined, 3, group.circular
						? circularBearing(values)
						: circularBearing(groupDirections));

						return [
							field,
							row(
								group.label,
								sample => {
									const value = groupValue(field, sample.values);
									if (value === null) return '—';
									if (field === 'rainAverage' && Number(value.toFixed(2)) === 0) return '';

									if (field === 'swell1Average' || field === 'wavesAverage') {
										const bearing = groupWaveDirection(field, sample);

										const arrow = bearing === null
										? ''
										: `<span class="forecast-arrow" style="transform:rotate(${bearing + 90}deg)">➤</span>`;

										return `${arrow}${value.toFixed(group.decimals)}`;
									}

									return group.circular
									? `<span class="forecast-arrow" style="transform:rotate(${value + 90}deg)">➤</span>${Math.round(value)}°`
									: value.toFixed(group.decimals);
								},
								field === 'gustAverage'
								? sample => forecastColorStyle('wind', groupValue(field, sample.values), 1 / 1.94384)
								: undefined,
								stats,
								field
							)
						];
					}))
				),
				{
					arrival: row('Hora', sample => `<span class="forecast-date-time"><small>${formatCompactDate(sample.eta)}</small><b>${formatWaypointHour(sample.eta)}</b></span>`, undefined, departureStats, 'arrival'),
					clouds: row('Cielo', sample => windyWeatherIcon(sample.icon), undefined, skyStatistics(), 'clouds'),
					ecmwfSky: row('Cielo', sample => skyFieldIcon('ecmwfSky', sample.values), undefined, statCell('Min', null, '', 0, undefined, 1) + statCell('Max', null, '', 0, undefined, 2) + statCell('Prom', null, '', 0, undefined, 3), 'ecmwfSky'),
					mblueSky: row('Cielo', sample => skyFieldIcon('mblueSky', sample.values), undefined, statCell('Min', null, '', 0, undefined, 1) + statCell('Max', null, '', 0, undefined, 2) + statCell('Prom', null, '', 0, undefined, 3), 'mblueSky'),
					iconSky: row('Cielo', sample => skyFieldIcon('iconSky', sample.values), undefined, statCell('Min', null, '', 0, undefined, 1) + statCell('Max', null, '', 0, undefined, 2) + statCell('Prom', null, '', 0, undefined, 3), 'iconSky'),
					aromeSky: row('Cielo', sample => skyFieldIcon('aromeSky', sample.values), undefined, statCell('Min', null, '', 0, undefined, 1) + statCell('Max', null, '', 0, undefined, 2) + statCell('Prom', null, '', 0, undefined, 3), 'aromeSky'),
					temperature: row('Temperatura', sample => forecastValue(sample, 'temperature'), undefined, statistics('temperature', '°C', 1), 'temperature'),
					rain: row('Lluvia', sample => forecastValue(sample, 'rain', 2), undefined, statistics('rain', ' in', 2), 'rain'),
					windAverage: row(
						'Viento',
						sample => {
							const value = averageWindForValues(sample.values);
							return value === null ? '—' : `${Math.round(value)}`;
						},
						sample => forecastColorStyle('wind', averageWindForValues(sample.values), 1 / 1.94384),
						(() => {
							const values = routeForecast.map(sample => averageWindForValues(sample.values)).filter(value => value !== null);
							if (!values.length) return statCell('Min', null, '', 0, undefined, 1) + statCell('Max', null, '', 0, undefined, 2) + statCell('Prom', null, '', 0, undefined, 3);
							const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
							return statCell('Min', Math.min(...values), ' kt', 0, undefined, 1) + statCell('Max', Math.max(...values), ' kt', 0, undefined, 2) + statCell('Prom', mean, ' kt', 0, undefined, 3);
						})(),
						'windAverage'
					),
					wind: row(
						'Viento',
						sample => forecastValue(sample, 'wind'),
						sample => {
							var _a;

							return forecastColorStyle(
								'wind',
								(_a = sample.values) === null || _a === void 0
								? void 0
								: _a.wind,
								1 / 1.94384
							);
						},
						statistics('wind', ' kt'),
						'wind'
					),
					ecmwfWind: row(
						'Viento',
						sample => forecastValue(sample, 'ecmwfWind'),
						sample => {
							var _a;

							return forecastColorStyle(
								'wind',
								(_a = sample.values) === null || _a === void 0
								? void 0
								: _a.ecmwfWind,
								1 / 1.94384
							);
						},
						statistics('ecmwfWind', ' kt'),
						'ecmwfWind'
					),
					mblueWind: row(
						'Viento',
						sample => forecastValue(sample, 'mblueWind'),
						sample => {
							var _a;

							return forecastColorStyle(
								'wind',
								(_a = sample.values) === null || _a === void 0
								? void 0
								: _a.mblueWind,
								1 / 1.94384
							);
						},
						statistics('mblueWind', ' kt'),
						'mblueWind'
					),
					iconWind: row(
						'Viento',
						sample => forecastValue(sample, 'iconWind'),
						sample => {
							var _a;

							return forecastColorStyle(
								'wind',
								(_a = sample.values) === null || _a === void 0
								? void 0
								: _a.iconWind,
								1 / 1.94384
							);
						},
						statistics('iconWind', ' kt'),
						'iconWind'
					),
					aromeWind: row(
						'Viento',
						sample => forecastValue(sample, 'aromeWind'),
						sample => {
							var _a;

							return forecastColorStyle(
								'wind',
								(_a = sample.values) === null || _a === void 0
								? void 0
								: _a.aromeWind,
								1 / 1.94384
							);
						},
						statistics('aromeWind', ' kt'),
						'aromeWind'
					),
					ecmwfWindDirection: row('Dirección viento', sample => directionFor(sample, 'ecmwfWindDirection'), undefined, statistics('ecmwfWindDirection', '°', 0, true), 'ecmwfWindDirection'),
					mblueWindDirection: row('Dirección viento', sample => directionFor(sample, 'mblueWindDirection'), undefined, statistics('mblueWindDirection', '°', 0, true), 'mblueWindDirection'),
					iconWindDirection: row('Dirección viento', sample => directionFor(sample, 'iconWindDirection'), undefined, statistics('iconWindDirection', '°', 0, true), 'iconWindDirection'),
					aromeWindDirection: row('Dirección viento', sample => directionFor(sample, 'aromeWindDirection'), undefined, statistics('aromeWindDirection', '°', 0, true), 'aromeWindDirection'),
					gust: row(
						'Rachas',
						sample => forecastValue(sample, 'gust'),
						sample => {
							var _a;

							return forecastColorStyle(
								'wind',
								(_a = sample.values) === null || _a === void 0
								? void 0
								: _a.gust,
								1 / 1.94384
							);
						},
						statistics('gust', ' kt'),
						'gust'
					),
					direction: row('Dirección viento', direction, undefined, statistics('direction', '°', 0, true), 'direction'),
					waves: row('Olas', sample => waveValue(sample, 'waves', 'wavesDir'), undefined, statistics('waves', ' m', 1, false, 'wavesDir'), 'waves'),
					swell1: row('Oleaje 1', sample => waveValue(sample, 'swell1', 'swell1Dir'), undefined, statistics('swell1', ' m', 1, false, 'swell1Dir'), 'swell1'),
					swell1Period: row('Período oleaje 1', sample => forecastValue(sample, 'swell1Period', 1), undefined, statistics('swell1Period', ' s', 1), 'swell1Period'),
					swell2: row('Oleaje 2', sample => waveValue(sample, 'swell2', 'swell2Dir'), undefined, statistics('swell2', ' m', 1, false, 'swell2Dir'), 'swell2'),
					swell2Period: row('Período oleaje 2', sample => forecastValue(sample, 'swell2Period', 1), undefined, statistics('swell2Period', ' s', 1), 'swell2Period'),
					windWaves: row('Mar de viento', sample => directionalValue(sample, 'windWaves', 'windWavesDir'), undefined, statistics('windWaves', ' m', 1, false, 'windWavesDir'), 'windWaves'),
					windWavesPeriod: row('Período mar de viento', sample => forecastValue(sample, 'windWavesPeriod', 1), undefined, statistics('windWavesPeriod', ' s', 1), 'windWavesPeriod'),
					current: row(
						'Corriente',
						sample => directionalValue(sample, 'current', 'currentDir'),
						sample => {
							var _a;

							return forecastColorStyle(
								'wind',
								(_a = sample.values) === null || _a === void 0
								? void 0
								: _a.current,
								1 / 1.94384
							);
						},
						statistics('current', ' kt', 0, false, 'currentDir'),
						'current'
					),
					currentTide: row(
						'Corriente de marea',
						sample => directionalValue(sample, 'currentTide', 'currentTideDir'),
						sample => {
							var _a;

							return forecastColorStyle(
								'wind',
								(_a = sample.values) === null || _a === void 0
								? void 0
								: _a.currentTide,
								1 / 1.94384
							);
						},
						statistics('currentTide', ' kt', 0, false, 'currentTideDir'),
						'currentTide'
					),
					wavesPeriod: row('Periodo', sample => forecastValue(sample, 'wavesPeriod', 1), undefined, statistics('wavesPeriod', ' s', 1), 'wavesPeriod'),
					wavesPower: row('Potencia', sample => forecastValue(sample, 'wavesPower', 0), undefined, statistics('wavesPower', ' kW/m'), 'wavesPower'),
					ecmwfWaves: row('Olas', sample => waveValue(sample, 'ecmwfWaves', 'ecmwfWavesDir'), undefined, statistics('ecmwfWaves', ' m', 1, false, 'ecmwfWavesDir'), 'ecmwfWaves'),
					ecmwfSwell1: row('Oleaje 1', sample => waveValue(sample, 'ecmwfSwell1', 'ecmwfSwell1Dir'), undefined, statistics('ecmwfSwell1', ' m', 1, false, 'ecmwfSwell1Dir'), 'ecmwfSwell1'),
					ecmwfSwell1Period: row('Período oleaje 1', sample => forecastValue(sample, 'ecmwfSwell1Period', 1), undefined, statistics('ecmwfSwell1Period', ' s', 1), 'ecmwfSwell1Period'),
					ecmwfWavesPeriod: row('Periodo', sample => forecastValue(sample, 'ecmwfWavesPeriod', 1), undefined, statistics('ecmwfWavesPeriod', ' s', 1), 'ecmwfWavesPeriod'),
					ecmwfWavesPower: row('Potencia', sample => forecastValue(sample, 'ecmwfWavesPower', 0), undefined, statistics('ecmwfWavesPower', ' kW/m'), 'ecmwfWavesPower')
				}
			);

			const visibleWindFields = activeWindModelFields();
			const showWindAverage = visibleWindFields.length > 1;

			const visibleRouteRows = routeFieldOrder.filter(key => key === 'windAverage'
			? showWindAverage
			: additionalGroups[key]
				? activeGroupFields(key).length > 1
				: !hiddenRouteFields.has(key)).map(key => {
				const group = additionalGroups[key];

				if (group) {
					const fields = activeGroupFields(key);

					return fields.length > 1
					? `${routeRows[key]}${collapsedGroups[key] === false
					? fields.map(field => routeRows[field].replace('class="forecast-field-row"', 'class="forecast-field-row forecast-wind-model-detail"')).join('')
					: ''}`
					: '';
				}

				if (Object.entries(additionalGroups).some(([groupKey, item]) => item.fields.includes(key) && activeGroupFields(groupKey).length > 1)) return '';
				if (windModelFieldKeys.includes(key) && showWindAverage) return '';

				if (key === 'windAverage') return showWindAverage
				? `${routeRows.windAverage}${windModelRowsCollapsed
				? ''
				: visibleWindFields.map(field => routeRows[field].replace('class="forecast-field-row"', 'class="forecast-field-row forecast-wind-model-detail"')).join('')}`
				: '';

				return routeRows[key];
			}).join('');

			const departurePassSegments = (liveRouteActive ? [] : departureEvaluations).map(item => {
				const itemTime = item.departure.getTime();
				const left = timelineX(itemTime);

				const status = !item.hasConstraints || item.passes === null
				? 'is-unknown'
				: item.passes ? 'is-pass' : 'is-fail';

				const qualityClass = item.qualityColor ? ' has-quality' : '';
				const optimalClass = item.isOptimal ? ' is-optimal' : '';

				const rankLabel = item.qualityRank === undefined
				? ''
				: item.isOptimal
					? ` · óptima${(item.qualityRankCount || 0) > 1 ? ' (empate)' : ''}`
					: ` · rango ${item.qualityRank} de ${item.qualityRankCount}`;

				const label = item.passes === true
				? `cumple las condiciones${rankLabel}`
				: item.passes === false
					? 'no cumple las condiciones'
					: 'sin evaluación disponible';

				const colorStyle = item.qualityColor
				? `--departure-quality-color:${item.qualityColor};`
				: '';

				return `<span class="route-analysis-slot ${status}${qualityClass}${optimalClass}" style="left:${left}px;${colorStyle}transform:translateX(-50%)" title="Salida ${formatTimelineDateTime(item.departure)}: ${label}"></span>`;
			}).join('');

			const speedControl = `<label class="forecast-bottom-action forecast-bottom-speed"><span>Velocidad</span><span class="forecast-departure-speed-input"><input type="number" min="0.1" step="0.1" value="${Number(speedKnots).toFixed(1)}" data-route-speed aria-label="Velocidad del vehículo en nudos"><small>kt</small></span></label>`;
			const waypointDistances = [0];
			for (let index = 1; index < points.length; index++) waypointDistances.push(waypointDistances[index - 1] + haversineNm(points[index - 1], points[index]));
			const waypointTrackLength = waypointDistances[waypointDistances.length - 1] || 0;

			const waypointTrackMarkers = points.map((_, index) => {
				if (liveRouteActive && index === 0) return '';

				const markerType = index === 0
				? 'is-start'
				: index === points.length - 1
					? 'is-destination'
					: 'is-intermediate';

				const left = waypointTrackLength > 0
				? waypointDistances[index] / waypointTrackLength * 100
				: 50;

				const name = index === 0
				? 'Inicio'
				: index === points.length - 1
					? 'Destino'
					: `Intermedio ${index}`;

				return `<span class="route-waypoint-dot ${markerType}" style="left:${left}%" title="P${waypointNumber(index)} · ${name}">${waypointNumber(index)}</span>`;
			}).join('');

			const routeWaypointRow = routeForecast.length
			? `<tr class="route-waypoint-row"><th class="route-waypoint-label" colspan="4" data-column-index="0" data-column-span="4">Waypoints</th><td class="route-waypoint-track" colspan="${routeForecast.length}">${waypointTrackMarkers}<span class="route-waypoint-boat" hidden title="Posición GPS aproximada en la ruta" aria-label="Posición GPS aproximada en la ruta"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4 L21 12 L3 20 L7 12 Z" fill="#087bd1" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg></span></td></tr>`
			: '';

			const distanceNm = points.slice(1).reduce((distance, point, index) => distance + haversineNm(points[index], point), 0);

			const distanceLabel = distanceUnit === 'km'
			? `${(distanceNm * 1.852).toFixed(1)} km`
			: `${distanceNm.toFixed(1)} Nm`;

			const routeDepartureFooter = `<div class="forecast-departure-control${liveRouteActive ? ' is-live' : ''}"><div class="departure-timebar-frame"><div class="departure-timebar-scroll" data-timeline-start="${timelineStart}" data-pixels-per-hour="${pixelsPerHour}" data-timebar-left-pad="${timelinePadding}" data-min-departure="${minDeparture}" data-max-departure="${maxDeparture}" data-departure-interval-hours="${departureIntervalHours}" aria-label="${liveRouteActive
		? 'Hora de salida bloqueada en modo EN VIVO'
		: 'Desplazar los días para elegir la hora de salida'}"><div class="departure-timebar" style="width:${timebarWidth}px"><div class="departure-timebar-days">${dayBands.join('')}</div><div class="departure-timebar-hours">${hourTicks.join('')}</div><div class="route-analysis-track" style="width:${timebarWidth}px">${departurePassSegments}</div></div></div><div class="departure-timebar-indicator"><span class="departure-timebar-cursor"></span><span class="departure-timebar-callout"><span>Inicio ${formatTimelineDateTime(selectedDeparture)} → Llega ${formatTimelineDateTime(arrivalTimestamp)}</span><small>Duración: ${formatDuration(routeDurationHours)} · ${distanceLabel}</small></span><span class="departure-timebar-callout-tail"></span></div></div></div>`;

			const routeColumnCount = routeForecast.length + 4;
			const routeColgroup = `<colgroup>${Array.from({ length: routeColumnCount }, (_, index) => `<col data-forecast-col="${index}">`).join('')}</colgroup>`;
			const routeTable = `${routeDepartureFooter}<div class="forecast-table-scroll"><table class="forecast-table">${routeColgroup}<thead>${routeWaypointRow}</thead><tbody>${visibleRouteRows}</tbody></table></div>`;

			forecastDrawer.innerHTML = `<div class="forecast-drawer"><header class="forecast-drawer-header"><span class="forecast-drawer-header-actions"><button type="button" class="forecast-drawer-close" aria-label="Cerrar pronóstico">×</button></span></header>${renderWindowConditionDialog()}${routeTable}<footer class="forecast-drawer-bottom-bar"><div class="forecast-bottom-add-field">${routeFieldAddControl}</div><button type="button" class="forecast-bottom-action" data-route-clear aria-label="Limpiar ruta">Limpiar ruta</button>${renderWeatherSettingsMenu()}${speedControl}<div class="forecast-saved-routes">${routeSnapshotActions.map((action, slot) => `<button type="button" class="forecast-bottom-action${action === 'load' ? ' route-snapshot-saved' : ''}" data-route-save-load="${slot}" aria-label="${action === 'save' ? 'Guardar' : 'Cargar'} ruta ${slot + 1}" title="${action === 'save'
		? 'Toca para guardar'
		: 'Toca para cargar; mantén apretado para reemplazar o borrar'}">${action === 'save' ? 'Guardar' : 'Cargar'} ${slot + 1}</button>`).join('')}</div></footer></div>`;

			if (gpsButton) forecastDrawer.appendChild(gpsButton);
			if (liveButton) forecastDrawer.appendChild(liveButton);
			if (centerButton) forecastDrawer.appendChild(centerButton);
			if (zoomInButton) forecastDrawer.appendChild(zoomInButton);
			if (zoomOutButton) forecastDrawer.appendChild(zoomOutButton);
			updateBoatTrackMarker();
			redrawWindIndicator();
			const mapSettingsTab = forecastDrawer.querySelector('.forecast-settings-map-tab');

			if (mapLabelSettings && mapSettingsTab) {
				mapLabelSettings.classList.add('label-settings--settings-tab');
				$$invalidate(10, mapLabelSettings.style.maxHeight = '', mapLabelSettings);
				$$invalidate(10, mapLabelSettings.open = true, mapLabelSettings);
				mapSettingsTab.appendChild(mapLabelSettings);
			}

			forecastDrawer.querySelectorAll('[data-condition-slider="min"]').forEach(updateConditionRangeSlider);
			forecastDrawer.hidden = !forecastDrawer.classList.contains('is-open');
			const scrollContainer = forecastDrawer.querySelector('.forecast-table-scroll');
			if (scrollContainer) scrollContainer.scrollLeft = existingScroll;
			const timebarScroll = forecastDrawer.querySelector('.departure-timebar-scroll');

			if (timebarScroll) {
				const restoredScroll = previousTimebar && !recenterDepartureTimeline
				? existingTimebarScroll
				: Math.max(0, selectedPosition - timebarScroll.clientWidth / 2);

				recenterDepartureTimeline = false;
				timebarScroll.dataset.programmaticScroll = String(restoredScroll);
				timebarScroll.scrollLeft = restoredScroll;
				departureTimelineScrollLeft = timebarScroll.scrollLeft;
			}

			if (timebarScroll) updateQuickDepartureFields(selectedDeparture);

			forecastDrawer.querySelectorAll('.forecast-field-picker').forEach(picker => {
				forecastDrawer === null || forecastDrawer === void 0
				? void 0
				: forecastDrawer.append(picker);

				picker.scrollTop = pickerScroll;
			});

			positionForecastFieldPickers();
			applyForecastColumnWidths();
			sizeDeparturePassMarkers();
		}

		function pickerGroupAvailableFields(key) {
			var _a;

			const fields = key === 'windAverage'
			? windModelFieldKeys
			: ((_a = additionalGroups[key]) === null || _a === void 0
				? void 0
				: _a.fields) || [];

			return fields.filter(field => hiddenRouteFields.has(field) && routeFieldOrder.includes(field));
		}

		function pickerGroupSelection(key) {
			const fields = pickerGroupAvailableFields(key);
			const count = fields.filter(field => selectedRouteFields.has(field)).length;

			return count === 0
			? 'false'
			: count === fields.length ? 'true' : 'mixed';
		}

		function refreshRoutePickerSelection() {
			if (!forecastDrawer) return;

			forecastDrawer.querySelectorAll('[data-route-field-add]').forEach(button => {
				const selected = selectedRouteFields.has(button.dataset.routeFieldAdd);
				button.setAttribute('aria-checked', String(selected));
				const check = button.querySelector('.forecast-field-check');
				if (check) check.textContent = selected ? '☑' : '☐';
			});

			forecastDrawer.querySelectorAll('[data-route-field-add-group]').forEach(button => {
				const status = pickerGroupSelection(button.dataset.routeFieldAddGroup);
				button.setAttribute('aria-checked', status);
				const check = button.querySelector('.forecast-field-check');
				if (check) check.textContent = status === 'true' ? '☑' : status === 'mixed' ? '▣' : '☐';
			});

			const submit = forecastDrawer.querySelector('[data-route-field-commit]');

			if (submit) {
				submit.disabled = selectedRouteFields.size === 0;
				submit.textContent = `Agregar campos (${selectedRouteFields.size})`;
			}
		}

		function renderRouteFieldAddControl() {
			const hiddenFields = routeFieldOrder.filter(key => key !== 'windAverage' && !additionalGroups[key] && hiddenRouteFields.has(key));

			const groupDefinitions = [
				{
					key: 'windAverage',
					label: 'Viento',
					fields: windModelFieldKeys
				},
				...Object.entries(additionalGroups).map(([key, group]) => ({
					key,
					label: group.label,
					fields: group.fields
				}))
			];

			const groupedFields = new Set(groupDefinitions.flatMap(group => group.fields));
			const compare = (left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' });

			const fieldButton = (field, nested = false) => {
				const selected = selectedRouteFields.has(field);
				return `<button type="button" class="forecast-field-select${nested ? ' forecast-field-group-item' : ''}" role="menuitemcheckbox" aria-checked="${selected}" data-route-field-add="${field}"><span class="forecast-field-check" aria-hidden="true">${selected ? '☑' : '☐'}</span>${routeFieldPickerLabels[field]}</button>`;
			};

			const entries = groupDefinitions.map(group => Object.assign(Object.assign({}, group), {
				available: group.fields.filter(field => hiddenFields.includes(field))
			})).filter(group => group.available.length > 0).map(group => {
				const state = pickerGroupSelection(group.key);

				return {
					label: group.label,
					html: `<button type="button" class="forecast-field-group" role="menuitemcheckbox" aria-checked="${state}" data-route-field-add-group="${group.key}" aria-label="Seleccionar modelos de ${group.label}"><span class="forecast-field-check" aria-hidden="true">${state === 'true' ? '☑' : state === 'mixed' ? '▣' : '☐'}</span>${group.label}</button>${group.available.sort((a, b) => compare(routeFieldPickerLabels[a], routeFieldPickerLabels[b])).map(field => fieldButton(field, true)).join('')}`
				};
			});

			hiddenFields.filter(field => !groupedFields.has(field)).forEach(field => entries.push({
				label: routeFieldPickerLabels[field],
				html: fieldButton(field)
			}));

			entries.sort((a, b) => compare(a.label, b.label));

			return `<span class="forecast-field-add-wrap"><button type="button" class="forecast-field-add" data-route-field-add-toggle aria-expanded="${showRouteFieldPicker}" aria-label="Agregar campo" title="Agregar campo">+</button>${showRouteFieldPicker
		? `<span class="forecast-field-picker" data-field-picker-kind="route" role="menu">${entries.length
			? entries.map(entry => entry.html).join('')
			: '<span>Todos los campos están visibles</span>'}<button type="button" class="forecast-field-commit" data-route-field-commit ${selectedRouteFields.size ? '' : 'disabled'}>Agregar campos (${selectedRouteFields.size})</button></span>`
		: ''}</span>`;
		}

		function saveRouteFieldLayout() {
			try {
				localStorage.setItem('route-builder-forecast-field-order', JSON.stringify(routeFieldOrder));
				localStorage.setItem('route-builder-forecast-hidden-fields', JSON.stringify([...hiddenRouteFields]));
			} catch(/* Keep the current layout for this session. */ _a) {
				
			} /* Keep the current layout for this session. */
		}

		function applyForecastColumnWidths() {
			const table = forecastDrawer === null || forecastDrawer === void 0
			? void 0
			: forecastDrawer.querySelector('.forecast-table');

			if (!table) return;
			const widths = getForecastColumnWidths(table);

			[...table.querySelectorAll('colgroup col')].forEach((column, index) => {
				if (widths[index] !== undefined) column.style.width = `${widths[index]}px`;
			});

			table.querySelectorAll('[data-column-index]').forEach(cell => {
				const index = Number(cell.dataset.columnIndex);
				if (!Number.isInteger(index) || widths[index] === undefined) return;
				const span = Number(cell.dataset.columnSpan) || 1;
				const width = widths.slice(index, index + span).reduce((sum, value) => sum + value, 0);
				cell.style.width = `${width}px`;
				cell.style.minWidth = `${width}px`;
				cell.style.maxWidth = `${width}px`;
				if (cell.classList.contains('forecast-row-label')) cell.style.left = '0px';
			});
		}

		function reorderForecastField(source, target, insertAfter) {
			if (source === target) return;
			const order = routeFieldOrder.filter(key => key !== source);
			const targetIndex = order.indexOf(target);
			if (targetIndex < 0) return;
			order.splice(targetIndex + (insertAfter ? 1 : 0), 0, source);
			routeFieldOrder = order;
			saveRouteFieldLayout();
			renderForecastDrawer();
		}

		function windowConditionConfigured(key) {
			if (key === 'arrival') return arrivalHours.length > 0 || arrivalDays.length > 0;

			if (isSkyField(key)) {
				if (key === 'skyAverage' && activeGroupFields(key).length < 2) return false;
				return windowConstraints[key].states.length > 0;
			}

			if (key === 'windAverage' && activeWindModelFields().length < 2) return false;
			if (additionalGroups[key] && activeGroupFields(key).length < 2) return false;
			if (windDirectionConditionKeys.includes(key)) return selectedDirections(key).length > 0;
			return selectedDirections(key).length > 0 || Object.values(windowConstraints[key]).some(value => value !== '' && value !== null && value !== undefined);
		}

		function hasConfiguredWindowConditions() {
			return windowFieldKeys.some(windowConditionConfigured);
		}

		function routeConditionResult(key) {
			if (!windowConditionConfigured(key) || !routeForecast.length) return null;
			if (key === 'arrival') return arrivalMatches(routeForecast[routeForecast.length - 1].eta);

			if (isSkyField(key)) {
				const allowed = windowConstraints[key].states;
				const states = routeForecast.map(sample => skyStateForField(key, sample.values));
				if (states.some(state => state === null)) return null;
				return states.every(state => allowed.includes(state));
			}

			const selections = selectedDirections(key);
			const bounds = windowConstraints[key];
			const hasRange = !windDirectionConditionKeys.includes(key) && (key === 'clouds' || bounds.min !== '' && bounds.min != null || bounds.max !== '' && bounds.max != null);
			const magnitude = hasRange ? routeMagnitudeConditionResult(key) : true;
			if (magnitude === false) return false;
			if (!selections.length) return magnitude;
			const matches = routeForecast.map(sample => directionMatches(key, sample.values));
			if (matches.some(value => value === false)) return false;

			return magnitude === null || matches.some(value => value === null)
			? null
			: true;
		}

		function routeMagnitudeConditionResult(key) {
			var _a;
			if (!windowConditionConfigured(key) || !routeForecast.length) return null;

			if (key === 'clouds') {
				const allowedStates = windowConstraints.clouds.states;

				const forecastStates = routeForecast.map(sample => {
					var _a;

					return (_a = sample.values) === null || _a === void 0
					? void 0
					: _a.skyState;
				});

				if (forecastStates.some(state => typeof state !== 'string')) return null;
				return forecastStates.every(state => allowedStates.includes(state));
			}

			const numericBounds = windowConstraints[key];

			const bound = value => value === '' || value === null || value === undefined || !Number.isFinite(Number(value))
			? null
			: Number(value);

			const min = bound(numericBounds.min), max = bound(numericBounds.max);

			if (newModelFields.includes(key) || [
				'temperatureAverage',
				'feelsAverage',
				'rainAverage',
				'gustAverage',
				'dewAverage'
			].includes(key)) {
				const values = routeForecast.map(sample => {
					var _a;

					return additionalGroups[key]
					? groupValue(key, sample.values)
					: (_a = sample.values) === null || _a === void 0
						? void 0
						: _a[key];
				});

				if (values.some(item => typeof item !== 'number' || !Number.isFinite(item))) return null;
				return values.every(item => (min === null || item >= min) && (max === null || item <= max));
			}

			let value = null;

			if (additionalGroups[key]) {
				const averages = routeForecast.map(sample => groupValue(key, sample.values));
				if (averages.some(item => item === null)) return null;

				value = additionalGroups[key].circular
				? averageDirection(averages)
				: Math.max(...averages);

				if (value === null) return null;
				if (additionalGroups[key].circular && min !== null && max !== null && min > max) return value >= min || value <= max;
			} else if (key === 'windAverage') {
				const averages = routeForecast.map(sample => averageWindForValues(sample.values));
				if (averages.some(item => item === null)) return null;
				value = Math.max(...averages);
			} else if ([
				'directionAverage',
				'direction',
				'ecmwfWindDirection',
				'mblueWindDirection',
				'iconWindDirection',
				'aromeWindDirection'
			].includes(key)) {
				const directionKey = key;

				const directions = routeForecast.map(sample => {
					var _a;

					return (_a = sample.values) === null || _a === void 0
					? void 0
					: _a[directionKey];
				}).filter(item => item !== null && item !== undefined && Number.isFinite(item));

				if (directions.length !== routeForecast.length) return null;
				value = averageDirection(directions);
				if (value === null) return null;
				value = (value % 360 + 360) % 360;
				if (min !== null && max !== null && min > max) return value >= min || value <= max;
			} else if (key === 'rain') {
				if (routeForecast.some(sample => {
					var _a;

					return !Number.isFinite((_a = sample.values) === null || _a === void 0
					? void 0
					: _a.rain);
				})) return null;

				value = routeForecast.reduce(
					(total, sample, index) => {
						var _a, _b, _c, _d, _e;

						const previous = (_b = (_a = routeForecast[index - 1]) === null || _a === void 0
						? void 0
						: _a.distanceNm) !== null && _b !== void 0
						? _b
						: sample.distanceNm;

						const next = (_d = (_c = routeForecast[index + 1]) === null || _c === void 0
						? void 0
						: _c.distanceNm) !== null && _d !== void 0
						? _d
						: sample.distanceNm;

						const hours = Math.max(0, (next - previous) / (2 * Math.max(0.1, speedKnots)));

						return total + Number((_e = sample.values) === null || _e === void 0
						? void 0
						: _e.rain) * hours;
					},
					0
				);
			} else {
				const metricByCondition = {
					temperature: 'temperature',
					wind: 'wind',
					ecmwfWind: 'ecmwfWind',
					mblueWind: 'mblueWind',
					iconWind: 'iconWind',
					aromeWind: 'aromeWind',
					gust: 'gust',
					waves: 'waves',
					swell1: 'swell1',
					swell1Period: 'swell1Period',
					swell2: 'swell2',
					swell2Period: 'swell2Period',
					windWaves: 'windWaves',
					windWavesPeriod: 'windWavesPeriod',
					current: 'current',
					currentTide: 'currentTide',
					ecmwfWindDirection: 'ecmwfWindDirection',
					mblueWindDirection: 'mblueWindDirection',
					iconWindDirection: 'iconWindDirection',
					aromeWindDirection: 'aromeWindDirection',
					wavesPeriod: 'wavesPeriod',
					wavesPower: 'wavesPower',
					ecmwfWaves: 'ecmwfWaves',
					ecmwfSwell1: 'ecmwfSwell1',
					ecmwfSwell1Period: 'ecmwfSwell1Period',
					ecmwfWavesPeriod: 'ecmwfWavesPeriod',
					ecmwfWavesPower: 'ecmwfWavesPower'
				};

				const metric = metricByCondition[key];
				if (!metric) return null;

				const values = routeForecast.map(sample => {
					var _a;

					return (_a = sample.values) === null || _a === void 0
					? void 0
					: _a[metric];
				}).filter(item => item !== null && item !== undefined && Number.isFinite(item));

				if (values.length !== routeForecast.length) return null;

				value = [
					'ecmwfWindDirection',
					'mblueWindDirection',
					'iconWindDirection',
					'aromeWindDirection'
				].includes(key)
				? (_a = averageDirection(values)) !== null && _a !== void 0
					? _a
					: null
				: key === 'temperature'
					? values.reduce((sum, item) => sum + item, 0) / values.length
					: Math.max(...values);
			}

			return value !== null && (min === null || value >= min) && (max === null || value <= max);
		}

		function updateConditionButtonStatus(key) {
			const status = routeConditionResult(key);

			forecastDrawer === null || forecastDrawer === void 0
			? void 0
			: forecastDrawer.querySelectorAll(`[data-window-condition="${key}"]`).forEach(button => {
					button.classList.toggle('is-configured', windowConditionConfigured(key));
					button.classList.toggle('is-pass', status === true);
					button.classList.toggle('is-fail', status === false);
				});
		}

		function renderWindowConditionDialog() {
			const key = activeWindowCondition;
			if (!key) return '';
			const title = routeFieldLabels[key];

			const escapeAttr = value => String(value !== null && value !== void 0 ? value : '').replace(/[&"<>]/g, char => ({
				'&': '&amp;',
				'"': '&quot;',
				'<': '&lt;',
				'>': '&gt;'
			})[char] || char);

			const range = (min, max, step, unit) => {
				const bounds = windowConstraints[key];
				if (bounds.min !== '') bounds.min = Math.max(min, Math.min(max, Number(bounds.min)));
				if (bounds.max !== '') bounds.max = Math.max(min, Math.min(max, Number(bounds.max)));

				const selectedMin = bounds.min === ''
				? min
				: Math.max(min, Math.min(max, Number(bounds.min)));

				const selectedMax = bounds.max === ''
				? max
				: Math.max(min, Math.min(max, Number(bounds.max)));

				const safeMin = Math.min(selectedMin, selectedMax);
				const safeMax = Math.max(selectedMin, selectedMax);
				const label = routeFieldLabels[key];
				return `<div class="condition-slider" data-condition-label="${escapeAttr(label)}" data-condition-unit="${escapeAttr(unit)}" data-condition-domain-min="${min}" data-condition-domain-max="${max}"><div class="condition-slider-summary" data-condition-range-summary>${escapeAttr(label)} de ${safeMin} a ${safeMax} ${unit}</div><div class="condition-slider-control"><div class="condition-slider-track"></div><div class="condition-slider-fill" data-condition-fill></div><input type="range" min="${min}" max="${max}" step="${step}" value="${safeMin}" data-condition-slider="min" data-condition-bound="min" aria-label="Límite mínimo de ${escapeAttr(label)}" /><input type="range" min="${min}" max="${max}" step="${step}" value="${safeMax}" data-condition-slider="max" data-condition-bound="max" aria-label="Límite máximo de ${escapeAttr(label)}" /></div><div class="condition-slider-ticks"><span>${min} ${unit}</span><span>${Number((min + (max - min) / 3).toFixed(1))}</span><span>${Number((min + 2 * (max - min) / 3).toFixed(1))}</span><span>${max} ${unit}</span></div></div>`;
			};

			let controls = '';

			if (isSkyField(key)) {
				const selectedStates = windowConstraints[key].states;

				const stateToggles = skyStateOptions.map(state => {
					const example = routeForecast.find(sample => {
						var _a;

						return ((_a = sample.values) === null || _a === void 0
						? void 0
						: _a.skyState) === state.id && Number.isFinite(sample.icon);
					});

					const icon = example
					? windyWeatherIcon(example.icon)
					: `<span class="sky-state-emoji" aria-hidden="true">${state.emoji}</span>`;

					return `<label class="sky-state-toggle"><input type="checkbox" data-sky-state="${state.id}" ${selectedStates.includes(state.id) ? 'checked' : ''} /><span class="sky-state-toggle-icon">${icon}</span><span>${state.label}</span></label>`;
				}).join('');

				controls = `<div class="sky-state-options">${stateToggles}</div><small>Activa los estados aceptables. Cada punto de la ruta debe coincidir con uno de los estados seleccionados.${key === 'skyAverage'
			? ' El grupo muestra el estado más frecuente; si hay empate o faltan datos, se muestra —.'
			: ''}</small>`;
			} else if (newModelFields.includes(key) || [
				'temperatureAverage',
				'feelsAverage',
				'rainAverage',
				'gustAverage',
				'dewAverage'
			].includes(key)) {
				if (key.toLowerCase().includes('rain')) controls = range(0, 20, 0.01, 'in'); else if (key.toLowerCase().includes('gust')) controls = range(0, 120, 1, 'kt'); else controls = range(-60, 60, 1, '°C');
			} else if (key === 'temperature') controls = range(-60, 60, 1, '°C'); else if (key === 'rain') controls = range(0, 20, 0.1, 'in'); else if (['windAverage', 'wind', 'ecmwfWind', 'mblueWind', 'iconWind', 'aromeWind'].includes(key)) controls = range(0, 40, 1, 'kt'); else if (key === 'gust') controls = range(0, 120, 1, 'kt'); else if (windDirectionConditionKeys.includes(key)) controls = ''; else if ([
				'wavesAverage',
				'swell1Average',
				'waves',
				'ecmwfWaves',
				'swell1',
				'swell2',
				'windWaves',
				'ecmwfSwell1'
			].includes(key)) controls = range(0, 10, 0.1, 'm'); else if ([
				'swell1PeriodAverage',
				'wavesPeriodAverage',
				'swell1Period',
				'swell2Period',
				'windWavesPeriod',
				'wavesPeriod',
				'ecmwfSwell1Period',
				'ecmwfWavesPeriod'
			].includes(key)) controls = range(0, 30, 0.1, 's'); else if (key === 'current' || key === 'currentTide') controls = range(0, 10, 0.1, 'kt'); else if (key === 'wavesPowerAverage' || key === 'wavesPower' || key === 'ecmwfWavesPower') controls = range(0, 20, 1, 'kW/m'); else if (key === 'arrival') {
				const hours = Array.from({ length: 24 }, (_, hour) => `<button type="button" class="arrival-choice${arrivalHours.includes(hour) ? ' is-selected' : ''}" data-arrival-hour="${hour}" aria-pressed="${arrivalHours.includes(hour)}">${String(hour).padStart(2, '0')}–${String(hour + 1).padStart(2, '0')}</button>`).join('');
				const days = [1, 2, 3, 4, 5, 6, 0].map(day => `<button type="button" class="arrival-choice${arrivalDays.includes(day) ? ' is-selected' : ''}" data-arrival-day="${day}" aria-pressed="${arrivalDays.includes(day)}">${arrivalDayLabels[day]}</button>`).join('');
				controls = `<strong>Hora de llegada</strong><div class="arrival-hours-grid">${hours}</div><button type="button" class="forecast-button arrival-day-preset" data-arrival-day-preset>Día (06–18)</button><strong>Día de llegada</strong><div class="arrival-days-grid">${days}</div><small>Sin selección se aceptan todas las horas o todos los días. Se usa la hora local del dispositivo.</small>`;
			}

			return `<div class="window-condition-backdrop" data-window-condition-dismiss><section class="window-condition-dialog" role="dialog" aria-modal="true" aria-label="Condición de ${escapeAttr(title)}"><header><strong>${escapeAttr(title)}</strong><button type="button" data-window-condition-dismiss aria-label="Cerrar condición">×</button></header><div class="condition-content">${controls}${directionWheel(key)}${isSkyField(key) || windDirectionConditionKeys.includes(key) || key === 'arrival'
		? ''
		: '<small>Usa los controles del rango para definir los límites.</small>'}</div><footer><button type="button" class="condition-clear-button" data-window-condition-clear="${key}">Limpiar condición</button><button type="button" class="forecast-button" data-window-condition-dismiss>Listo</button></footer></section></div>`;
		}

		function closeForecastDrawer() {
			forecastDrawer === null || forecastDrawer === void 0
			? void 0
			: forecastDrawer.classList.remove('is-open');

			if (forecastDrawer) forecastDrawer.hidden = true;
			showWeatherSettingsMenu = false;
			setForecastOpenState(false);
			if (forecastReopenButton) forecastReopenButton.hidden = false;
			hideRouteForecastHighlight();
		}

		function closeNavigatorPlugin() {
			var _a;

			const pluginCloseButton = (_a = document.getElementById(`plugin-${config.name}`)) === null || _a === void 0
			? void 0
			: _a.querySelector('.closing-x');

			if (pluginCloseButton) pluginCloseButton.click(); else closeForecastDrawer();
		}

		function positionForecastDrawer() {
			if (!forecastDrawer) return;
			setForecastOpenState(!forecastDrawer.hidden && forecastDrawer.classList.contains('is-open'));
			const bounds = map.getContainer().getBoundingClientRect();
			const sidePanel = document.querySelector('.plugin-rhpane');

			const sidePanelBounds = sidePanel === null || sidePanel === void 0
			? void 0
			: sidePanel.getBoundingClientRect();

			const sidePanelVisible = !!sidePanel && getComputedStyle(sidePanel).display !== 'none' && ((sidePanelBounds === null || sidePanelBounds === void 0
			? void 0
			: sidePanelBounds.width) || 0) > 0;

			const sidePanelLeft = sidePanelVisible
			? sidePanelBounds.left
			: window.innerWidth;

			const drawerLeft = Math.max(0, bounds.left);

			const drawerRight = sidePanelVisible
			? Math.max(drawerLeft, Math.min(bounds.right, sidePanelLeft, window.innerWidth))
			: window.innerWidth;

			forecastDrawer.style.left = `${drawerLeft}px`;
			forecastDrawer.style.right = `${Math.max(0, window.innerWidth - drawerRight)}px`;
			sizeDeparturePassMarkers();
		}

		function sizeDeparturePassMarkers() {
			const track = forecastDrawer === null || forecastDrawer === void 0
			? void 0
			: forecastDrawer.querySelector('.route-analysis-track');

			if (!track || track.clientWidth <= 0) return;
			const markers = [...track.querySelectorAll('.route-analysis-slot')];

			markers.forEach(marker => {
				const diameter = marker.classList.contains('is-optimal') ? 10 : 6;
				marker.style.setProperty('--departure-marker-size', `${diameter}px`);
				marker.style.top = `${(track.clientHeight - diameter) / 2}px`;
			});
		}

		function positionForecastFieldPickers() {
			if (!forecastDrawer || forecastDrawer.hidden) return;

			forecastDrawer.querySelectorAll('.forecast-field-picker').forEach(picker => {
				const button = forecastDrawer.querySelector('[data-route-field-add-toggle]');
				if (!button) return;
				const rect = button.getBoundingClientRect();
				const width = Math.min(220, window.innerWidth - 16);
				const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width));
				const availableAbove = Math.max(60, rect.top - 12);
				picker.style.position = 'fixed';
				picker.style.top = 'auto';
				picker.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 4)}px`;
				picker.style.left = `${left}px`;
				picker.style.right = 'auto';
				picker.style.maxHeight = `${Math.min(240, availableAbove)}px`;
			});
		}

		function redrawMap() {
			var _a, _b;

			pastWaypointLayer === null || pastWaypointLayer === void 0
			? void 0
			: pastWaypointLayer.removeFrom(map);

			pastWaypointLayer = null;

			if (liveRouteActive && livePastWaypoints.length) {
				pastWaypointLayer = L.layerGroup().addTo(map);

				for (const { point, number } of livePastWaypoints) {
					const size = waypointSize + 13;

					const icon = L.divIcon({
						className: 'route-builder-past-marker-wrap',
						html: `<span class="route-builder-past-marker" style="--route-marker-size:${waypointSize}px;--route-marker-font-size:${Math.round(waypointSize * 0.63)}px">${number}</span>`,
						iconSize: [size, size],
						iconAnchor: [size / 2, size / 2]
					});

					L.marker([point.lat, point.lon], {
						icon,
						draggable: false,
						interactive: true,
						bubblingMouseEvents: false
					}).addTo(pastWaypointLayer);
				}
			}

			if (points.length === 0) {
				for (const marker of waypointMarkers.values()) {
					(_a = marker.dragging) === null || _a === void 0
					? void 0
					: _a.disable();

					marker.off();
				}

				waypointMarkers.clear();

				waypointLayer === null || waypointLayer === void 0
				? void 0
				: waypointLayer.removeFrom(map);

				waypointLayer = null;
				redrawRouteGeometry(points);
				return;
			}

			if (!waypointLayer) waypointLayer = L.layerGroup().addTo(map);
			const activeIds = new Set(points.filter((_, index) => !liveRouteActive || index !== 0).map(point => point.id));

			for (const [id, marker] of waypointMarkers) {
				if (!activeIds.has(id)) {
					(_b = marker.dragging) === null || _b === void 0
					? void 0
					: _b.disable();

					marker.off();
					waypointLayer.removeLayer(marker);
					waypointMarkers.delete(id);
				}
			}

			const liveFix = liveRouteActive && navigationFix && Date.now() - navigationFix.timestamp <= 30000
			? navigationFix
			: null;

			const metricPoints = liveFix && points.length
			? [
					Object.assign(Object.assign({}, points[0]), { lat: liveFix.lat, lon: liveFix.lon }),
					...points.slice(1)
				]
			: points;

			const metricDistanceNm = metricPoints.slice(1).reduce((sum, point, index) => sum + haversineNm(metricPoints[index], point), 0);
			const waypointTimes = calculateWaypointTimes(metricPoints, liveRouteActive ? Date.now() : undefined);

			points.forEach((point, index) => {
				if (liveRouteActive && index === 0) return;

				const role = index === 0
				? 'start'
				: index === points.length - 1 ? 'end' : 'via';

				const eta = waypointTimes[index];
				const etaDate = eta ? formatWaypointDate(eta) : '--';
				const etaHour = eta ? formatWaypointHour(eta) : '--:--';
				const cumulativeNm = metricPoints.slice(1, index + 1).reduce((sum, current, segmentIndex) => sum + haversineNm(metricPoints[segmentIndex], current), 0);
				const remainingNm = Math.max(0, metricDistanceNm - cumulativeNm);
				const distanceLabel = nm => `${(distanceUnit === 'km' ? nm * 1.852 : nm).toFixed(1)} ${distanceUnit === 'km' ? 'km' : 'Nm'}`;

				const waypointValues = {
					'waypoint-date': etaDate,
					'waypoint-hour': etaHour,
					'waypoint-distance-accumulated': distanceLabel(cumulativeNm),
					'waypoint-time-accumulated': formatDuration(cumulativeNm / Math.max(0.1, speedKnots)),
					'waypoint-distance-remaining': distanceLabel(remainingNm),
					'waypoint-time-remaining': formatDuration(remainingNm / Math.max(0.1, speedKnots))
				};

				const hasWaypointData = waypointFieldOrder.some(isWaypointFieldVisible);

				const waypointData = ['above', 'below'].map(position => {
					const fields = waypointFieldOrder.map(field => {
						if (isWaypointFieldVisible(field) && waypointFieldPositions[field] === position) return `<span class="route-builder-marker-${field}">${waypointValues[field]}</span>`;
						return '';
					}).filter(Boolean).join('<span class="route-builder-marker-separator">·</span>');

					return fields
					? `<span class="route-builder-marker-time-line route-builder-marker-time-line--${position}">${fields}</span>`
					: '';
				}).join('');

				const icon = L.divIcon({
					className: 'route-builder-marker-wrap',
					html: `<span class="route-builder-marker route-builder-marker--${role}" data-point-id="${point.id}" style="--route-marker-size:${waypointSize}px;--route-marker-font-size:${Math.round(waypointSize * 0.63)}px;--route-waypoint-label-font-size:${waypointLabelFontSize}px"><span class="route-builder-marker-number">${waypointNumber(index)}</span><span class="route-builder-marker-time" title="Hora local estimada de llegada" style="display:${hasWaypointData ? 'block' : 'none'}">${waypointData}</span></span>`,
					iconSize: [waypointSize + 13, waypointSize + 13],
					iconAnchor: [(waypointSize + 13) / 2, (waypointSize + 13) / 2]
				});

				let marker = waypointMarkers.get(point.id);

				if (!marker) {
					marker = L.marker([point.lat, point.lon], {
						icon,
						draggable: true,
						interactive: true,
						bubblingMouseEvents: false
					});

					marker.on('dragstart', () => {
						recentlyDraggedWaypoint = {
							id: point.id,
							expiresAt: Date.now() + 5000
						};
					});

					marker.on('drag', event => {
						const position = event.target.getLatLng();

						redrawRouteGeometry(points.map(current => current.id === point.id
						? Object.assign(Object.assign({}, current), { lat: position.lat, lon: position.lng })
						: current));
					});

					marker.on('dragend', event => {
						recentlyDraggedWaypoint = {
							id: point.id,
							expiresAt: Date.now() + 500
						};

						const position = event.target.getLatLng();

						$$invalidate(0, points = points.map(current => current.id === point.id
						? Object.assign(Object.assign({}, current), { lat: position.lat, lon: position.lng })
						: current));

						// Reuse forecasts for samples whose position and ETA stay
						// unchanged before the moved waypoint; the affected leg
						// and everything after it will get fresh samples.
						recalculate(true, true);
					});

					waypointMarkerSizes.set(marker, waypointSize);
					waypointMarkerLabelLayouts.set(marker, waypointFieldOrder.filter(field => isWaypointFieldVisible(field)).join('|') + `:${JSON.stringify(waypointFieldPositions)}`);
					waypointMarkers.set(point.id, marker);
					waypointLayer.addLayer(marker);
				} else {
					const currentPosition = marker.getLatLng();

					if (currentPosition.lat !== point.lat || currentPosition.lng !== point.lon) {
						marker.setLatLng([point.lat, point.lon]);
					}

					if (waypointMarkerSizes.get(marker) !== waypointSize) {
						marker.setIcon(icon);
						waypointMarkerSizes.set(marker, waypointSize);
					} else {
						const element = marker.getElement();

						const badge = element === null || element === void 0
						? void 0
						: element.querySelector('.route-builder-marker');

						const number = element === null || element === void 0
						? void 0
						: element.querySelector('.route-builder-marker-number');

						const time = element === null || element === void 0
						? void 0
						: element.querySelector('.route-builder-marker-time');

						if (badge && number && time) {
							const nextBadgeClass = `route-builder-marker route-builder-marker--${role}`;
							if (badge.className !== nextBadgeClass) badge.className = nextBadgeClass;
							badge.style.setProperty('--route-marker-size', `${waypointSize}px`);
							badge.style.setProperty('--route-marker-font-size', `${Math.round(waypointSize * 0.63)}px`);
							badge.style.setProperty('--route-waypoint-label-font-size', `${waypointLabelFontSize}px`);
							const nextNumber = String(waypointNumber(index));
							if (number.textContent !== nextNumber) number.textContent = nextNumber;
							const nextDisplay = hasWaypointData ? 'block' : 'none';
							if (time.style.display !== nextDisplay) time.style.display = nextDisplay;
							const labelLayout = waypointFieldOrder.filter(field => isWaypointFieldVisible(field)).join('|') + `:${JSON.stringify(waypointFieldPositions)}`;

							if (waypointMarkerLabelLayouts.get(marker) !== labelLayout) {
								time.innerHTML = waypointData;
								waypointMarkerLabelLayouts.set(marker, labelLayout);
							} else {
								for (const [field, value] of Object.entries(waypointValues)) {
									const valueElement = time.querySelector(`.route-builder-marker-${field}`);
									if (valueElement && valueElement.textContent !== value) valueElement.textContent = value;
								}
							}
						} else {
							marker.setIcon(icon);
						}
					}
				}
			});

			redrawRouteGeometry(points);
		}

		function redrawRouteGeometry(routePoints) {
			if (liveRouteActive && livePastWaypoints.length && routePoints.length) {
				const pastLatLngs = livePastWaypoints.map(({ point }) => [point.lat, point.lon]);
				pastLatLngs.push([routePoints[0].lat, routePoints[0].lon]);

				if (pastRouteLine) pastRouteLine.setLatLngs(pastLatLngs); else pastRouteLine = L.polyline(pastLatLngs, {
					color: '#7b8588',
					weight: 3,
					opacity: 0.95,
					interactive: false
				}).addTo(map);
			} else if (pastRouteLine) {
				pastRouteLine.removeFrom(map);
				pastRouteLine = null;
			}

			if (routePoints.length > 1) {
				const latLngs = routePoints.map(point => [point.lat, point.lon]);

				if (routeLine) routeLine.setLatLngs(latLngs); else routeLine = L.polyline(latLngs, {
					color: '#ffffff',
					weight: 3,
					opacity: 0.95,
					interactive: false
				}).addTo(map);
			} else if (routeLine) {
				routeLine.removeFrom(map);
				routeLine = null;
			}

			redrawDistanceLabels(routePoints);
		}

		function redrawDistanceLabels(routePoints = points) {
			if (!distanceLabelOverlay) return;
			const activeSegments = new Set();

			routePoints.slice(1).forEach((point, index) => {
				try {
					const previous = routePoints[index];
					const segmentKey = `${previous.id}:${point.id}`;
					activeSegments.add(segmentKey);
					const from = map.latLngToContainerPoint([previous.lat, previous.lon]);
					const to = map.latLngToContainerPoint([point.lat, point.lon]);
					let angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
					if (angle > 90) angle -= 180; else if (angle < -90) angle += 180;
					const segmentKm = haversineNm(previous, point) * 1.852;
					const segmentNm = haversineNm(previous, point);
					const segmentDuration = formatDuration(segmentNm / Math.max(0.1, speedKnots));
					const bearing = String(Math.round(trueBearing(previous, point))).padStart(3, '0');

					const position = {
						x: (from.x + to.x) / 2,
						y: (from.y + to.y) / 2
					};

					const angleRadians = angle * Math.PI / 180;
					const normalX = -Math.sin(angleRadians);
					const normalY = Math.cos(angleRadians);

					const segmentData = [
						showSegmentTime
						? {
								field: 'segment-time',
								text: segmentDuration,
								position: segmentTimePosition,
								font: `700 ${segmentLabelFontSize}px/1.2 Arial,sans-serif`
							}
						: null,
						showSegmentBearing
						? {
								field: 'segment-bearing',
								text: `${bearing}°T`,
								position: segmentBearingPosition,
								font: `700 ${segmentLabelFontSize}px/1.2 Arial,sans-serif`
							}
						: null,
						showSegmentDistance
						? {
								field: 'segment-distance',
								text: `${(distanceUnit === 'km' ? segmentKm : segmentNm).toFixed(1)}${distanceUnit}`,
								position: segmentDistancePosition,
								font: `700 ${segmentLabelFontSize}px/1.2 ${distanceFontStacks[distanceFont]}`
							}
						: null
					].filter(item => item !== null);

					segmentData.sort((a, b) => segmentFieldOrder.indexOf(a.field) - segmentFieldOrder.indexOf(b.field));
					const layout = segmentData.map(item => `${item.field}:${item.position}:${item.font}`).join('|');
					let group = segmentLabelGroups.get(segmentKey);

					if (!segmentData.length) {
						group === null || group === void 0
						? void 0
						: group.element.remove();

						segmentLabelGroups.delete(segmentKey);
						return;
					}

					if (!group) {
						const element = document.createElement('div');

						Object.assign(element.style, {
							position: 'absolute',
							width: '0',
							height: '0',
							overflow: 'visible'
						});

						group = { element, layout: '' };
						segmentLabelGroups.set(segmentKey, group);
						distanceLabelOverlay.appendChild(element);
					}

					group.element.style.left = `${position.x}px`;
					group.element.style.top = `${position.y}px`;
					const layoutChanged = group.layout !== layout;
					if (layoutChanged) group.element.replaceChildren();
					const sideItems = { above: [], below: [] };
					segmentData.forEach(item => sideItems[item.position].push(item));

					for (const side of ['above', 'below']) {
						const items = sideItems[side];
						if (!items.length) continue;
						let labelContainer = group.element.querySelector(`.route-builder-segment-label--${side}`);

						if (layoutChanged || !labelContainer) {
							labelContainer = document.createElement('div');
							labelContainer.className = `route-builder-segment-label route-builder-segment-label--${side}`;

							Object.assign(labelContainer.style, {
								position: 'absolute',
								display: 'flex',
								alignItems: 'center',
								gap: '4px',
								width: 'max-content',
								transformOrigin: 'center'
							});

							group.element.appendChild(labelContainer);
						}

						const offset = side === 'above' ? -12 : 12;

						Object.assign(labelContainer.style, {
							left: `${normalX * offset}px`,
							top: `${normalY * offset}px`,
							transform: `translate(-50%,-50%) rotate(${angle}deg)`
						});

						for (const item of items) {
							let label = labelContainer.querySelector(`[data-segment-field="${item.field}"]`);

							if (!label) {
								label = document.createElement('span');
								label.dataset.segmentField = item.field;

								Object.assign(label.style, {
									display: 'block',
									whiteSpace: 'nowrap',
									textAlign: 'center',
									color: '#fff',
									textShadow: '0 1px 3px #526575, 0 0 5px #526575'
								});

								labelContainer.appendChild(label);
							}

							label.textContent = item.text;
							label.style.font = item.font;
						}
					}

					group.layout = layout;
				} catch(error) {
					console.warn('No se pudo mostrar la distancia de este tramo.', error);
				}
			});

			for (const [key, group] of segmentLabelGroups) {
				if (!activeSegments.has(key)) {
					group.element.remove();
					segmentLabelGroups.delete(key);
				}
			}
		}

		function nearestRouteSegment(position) {
			let closest = -1;
			let distance = 12;

			for (let index = 0; index < points.length - 1; index++) {
				const start = map.latLngToContainerPoint([points[index].lat, points[index].lon]);
				const end = map.latLngToContainerPoint([points[index + 1].lat, points[index + 1].lon]);
				const dx = end.x - start.x;
				const dy = end.y - start.y;
				const length = dx * dx + dy * dy;

				const fraction = length
				? Math.max(0, Math.min(1, ((position.x - start.x) * dx + (position.y - start.y) * dy) / length))
				: 0;

				const offset = Math.hypot(position.x - start.x - fraction * dx, position.y - start.y - fraction * dy);

				if (offset < distance) {
					distance = offset;
					closest = index;
				}
			}

			return closest;
		}

		function onWaypointClickCapture(event) {
			var _a;

			const wrapper = (_a = event.target) === null || _a === void 0
			? void 0
			: _a.closest('.route-builder-marker-wrap');

			if (!wrapper || !map.getContainer().contains(wrapper)) return;
			const badge = wrapper.querySelector('.route-builder-marker');
			if (!badge) return;
			stopMapClick(event);
			const id = Number(badge.dataset.pointId);

			if ((recentlyDraggedWaypoint === null || recentlyDraggedWaypoint === void 0
			? void 0
			: recentlyDraggedWaypoint.id) === id && Date.now() < recentlyDraggedWaypoint.expiresAt) return;

			window.requestAnimationFrame(() => openWaypointMenu(id));
		}

		function openWaypointMenu(id) {
			var _a;
			const index = points.findIndex(point => point.id === id);
			if (index < 0) return;

			(_a = document.querySelector('.route-waypoint-dialog-backdrop')) === null || _a === void 0
			? void 0
			: _a.remove();

			const point = points[index];
			const values = { lat: point.lat, lon: point.lon };
			let mode = 'minutes';
			const dirty = { lat: false, lon: false };
			const backdrop = document.createElement('div');
			backdrop.className = 'route-waypoint-dialog-backdrop';
			backdrop.innerHTML = `<section class="route-waypoint-dialog" role="dialog" aria-modal="true" aria-label="Waypoint ${waypointNumber(index)}"><h3>Waypoint ${waypointNumber(index)}</h3><button type="button" class="coordinate-mode" data-action="mode"></button><div class="coordinate-editors"></div><p class="route-waypoint-error" hidden>Coordenada fuera de rango.</p><div class="coordinate-actions"><button type="button" data-action="delete">Borrar</button><button type="button" data-action="cancel">Cancelar</button><button type="button" data-action="save">Guardar</button></div></section>`;
			const editors = backdrop.querySelector('.coordinate-editors');
			const error = backdrop.querySelector('.route-waypoint-error');
			const rowHeight = 32;
			const wheel = (axis, part, label, items, selected, showLabel = true) => `<div class="coordinate-column">${showLabel ? `<span>${label}</span>` : ''}<div class="coordinate-wheel" tabindex="0" role="listbox" aria-label="${axis === 'lat' ? 'Latitud' : 'Longitud'} ${label}" data-axis="${axis}" data-part="${part}" data-initial="${selected}">${items.map((value, i) => `<div role="option" data-index="${i}">${value}</div>`).join('')}</div></div>`;
			const range = (count, width) => Array.from({ length: count }, (_, i) => String(i).padStart(width, '0'));

			function render() {
				backdrop.querySelector('[data-action="mode"]').textContent = mode === 'minutes'
				? 'Formato: GG° MM.MMM′ · Cambiar'
				: 'Formato: GG.GGG° · Cambiar';

				editors.innerHTML = ['lat', 'lon'].map(axis => {
					const latitude = axis === 'lat';
					const max = latitude ? 90 : 180;
					const absolute = Math.abs(values[axis]);
					const units = Math.min(max * (mode === 'minutes' ? 60000 : 1000), Math.round(absolute * (mode === 'minutes' ? 60000 : 1000)));
					const degrees = Math.floor(units / (mode === 'minutes' ? 60000 : 1000));

					const minutes = mode === 'minutes'
					? Math.floor(units % 60000 / 1000)
					: 0;

					const decimals = units % 1000;
					const hemispheres = latitude ? ['N', 'S'] : ['E', 'O'];
					const signIndex = values[axis] < 0 || Object.is(values[axis], -0) ? 1 : 0;
					const fraction = `<div class="coordinate-fraction"><span>Decimales</span><div class="coordinate-fraction-wheels">${wheel(axis, 'tenths', 'Décimas', range(10, 1), Math.floor(decimals / 100), false)}${wheel(axis, 'hundredths', 'Centésimas', range(10, 1), Math.floor(decimals / 10) % 10, false)}${wheel(axis, 'thousandths', 'Milésimas', range(10, 1), decimals % 10, false)}</div></div>`;

					return `<section class="coordinate-section"><strong>${latitude ? 'Latitud' : 'Longitud'}</strong><div class="coordinate-columns">${wheel(axis, 'degrees', 'Grados', range(max + 1, latitude ? 2 : 3), degrees)}${mode === 'minutes'
				? wheel(axis, 'minutes', 'Minutos', range(60, 2), minutes)
				: ''}${fraction}${wheel(axis, 'hemisphere', 'Hemisferio', hemispheres, signIndex)}</div><div class="coordinate-preview" data-preview="${axis}"></div></section>`;
				}).join('');

				editors.querySelectorAll('.coordinate-wheel').forEach(element => {
					element.scrollTop = Number(element.dataset.initial) * rowHeight;
					let interacted = false;

					element.addEventListener('pointerdown', () => {
						interacted = true;
					});

					element.addEventListener(
						'wheel',
						() => {
							interacted = true;
						},
						{ passive: true }
					);

					element.addEventListener('keydown', () => {
						interacted = true;
					});

					element.addEventListener('scroll', () => {
						if (interacted && Math.round(element.scrollTop / rowHeight) !== Number(element.dataset.initial)) dirty[element.dataset.axis] = true;
						updatePreview();
					});

					element.addEventListener('click', event => {
						const option = event.target.closest('[data-index]');

						if (option) element.scrollTo({
							top: Number(option.dataset.index) * rowHeight,
							behavior: 'smooth'
						});
					});
				});

				updatePreview();
			}

			function getValue(axis) {
				const find = part => {
					const el = editors.querySelector(`.coordinate-wheel[data-axis="${axis}"][data-part="${part}"]`);

					return el
					? Math.max(0, Math.min(el.children.length - 1, Math.round(el.scrollTop / rowHeight)))
					: 0;
				};

				const degrees = find('degrees'), minutes = find('minutes');
				const fraction = find('tenths') * 100 + find('hundredths') * 10 + find('thousandths');

				const magnitude = degrees + (mode === 'minutes'
				? (minutes + fraction / 1000) / 60
				: fraction / 1000);

				if (magnitude > (axis === 'lat' ? 90 : 180)) return null;
				return magnitude * (find('hemisphere') ? -1 : 1);
			}

			function updatePreview() {
				for (const axis of ['lat', 'lon']) {
					const coordinate = getValue(axis);
					const preview = editors.querySelector(`[data-preview="${axis}"]`);

					if (preview) preview.textContent = coordinate === null
					? 'Fuera de rango'
					: `${Math.abs(coordinate).toFixed(6)}° ${coordinate < 0 || Object.is(coordinate, -0)
					? axis === 'lat' ? 'S' : 'O'
					: axis === 'lat' ? 'N' : 'E'}`;
				}
			}

			function commitEdits() {
				for (const axis of ['lat', 'lon']) {
					if (Array.from(editors.querySelectorAll(`.coordinate-wheel[data-axis="${axis}"]`)).some(el => Math.round(el.scrollTop / rowHeight) !== Number(el.dataset.initial))) dirty[axis] = true;
					if (!dirty[axis]) continue;
					const coordinate = getValue(axis);

					if (coordinate === null) {
						error.hidden = false;
						return false;
					}
				}

				for (const axis of ['lat', 'lon']) {
					if (dirty[axis]) values[axis] = getValue(axis);
					dirty[axis] = false;
				}

				error.hidden = true;
				return true;
			}

			backdrop.addEventListener('click', event => {
				const target = event.target;

				if (target === backdrop || target.dataset.action === 'cancel') {
					backdrop.remove();
					return;
				}

				if (target.dataset.action === 'delete') {
					backdrop.remove();
					removePoint(String(id));
					return;
				}

				if (target.dataset.action === 'mode') {
					if (commitEdits()) {
						mode = mode === 'minutes' ? 'decimal' : 'minutes';
						render();
					}

					return;
				}

				if (target.dataset.action !== 'save' || !commitEdits()) return;

				if (!points.some(current => current.id === id)) {
					backdrop.remove();
					return;
				}

				$$invalidate(0, points = points.map(current => current.id === id
				? Object.assign(Object.assign({}, current), { lat: values.lat, lon: values.lon })
				: current));

				backdrop.remove();
				recalculate(true, true);
			});

			document.body.appendChild(backdrop);
			render();
		}

		let mapMouseGesture = null;
		let mapMouseDown = false;

		function onMapMouseDown(event) {
			const target = event.target;
			mapMouseDown = event.button === 0 && !!target && map.getContainer().contains(target);

			mapMouseGesture = mapMouseDown
			? {
					x: event.clientX,
					y: event.clientY,
					moved: false
				}
			: null;
		}

		function onMapMouseMove(event) {
			if (mapMouseDown && mapMouseGesture && Math.hypot(event.clientX - mapMouseGesture.x, event.clientY - mapMouseGesture.y) > 5) mapMouseGesture.moved = true;
		}

		function onMapMouseUp(event) {
			onMapMouseMove(event);
			mapMouseDown = false;
		}

		function onMapDomClick(event) {
			if (event.button !== 0) return;

			const dragged = (mapMouseGesture === null || mapMouseGesture === void 0
			? void 0
			: mapMouseGesture.moved) === true;

			mapMouseGesture = null;
			if (dragged) return;
			const target = event.target;
			if (!target || !map.getContainer().contains(target)) return;

			if (target.closest('.route-builder-past-marker-wrap')) {
				stopMapClick(event);
				return;
			}

			if (target.closest('.route-builder-marker-wrap')) {
				onWaypointClickCapture(event);
				return;
			}

			if (target.closest('.leaflet-control, .leaflet-popup, .leaflet-tooltip, button, a, input, select, textarea, [role="button"], [role="link"], [role="menuitem"], .button, .close')) return;
			const location = map.mouseEventToLatLng(event);
			if (!hasValidCoordinates(location.lat, location.lng)) return;
			const pixel = map.latLngToContainerPoint(location);

			if (points.some(point => map.latLngToContainerPoint([point.lat, point.lon]).distanceTo(pixel) <= Math.max(18, waypointSize / 2 + 8))) {
				stopMapClick(event);
				return;
			}

			const segment = nearestRouteSegment(pixel);
			stopMapClick(event);

			window.requestAnimationFrame(() => {
				const point = {
					id: nextPointId++,
					lat: location.lat,
					lon: location.lng
				};

				const next = [...points];

				if (segment >= 0 && segment < next.length - 1) {
					const insertAt = segment + 1;
					renumberLiveWaypointInsertion(insertAt, point.id);
					next.splice(insertAt, 0, point);
				} else next.push(point);

				$$invalidate(0, points = next);
				recalculate(true, true);
			});
		}

		function redrawMapOverlays() {
			redrawDistanceLabels(liveDisplayPoints !== null && liveDisplayPoints !== void 0
			? liveDisplayPoints
			: points);

			redrawGpsCourseLine();
			redrawWindIndicator();
			redrawWaveIndicator();
			redrawLaylines();
			redrawWindRose();
		}

		function redrawWindIndicator() {
			var _a, _b, _c;
			const fix = navigationFix;
			const now = Date.now();

			if (!navigationActive || !fix || now - fix.timestamp > 30000 || !windIndicatorField) {
				if (windIndicatorOverlay) windIndicatorOverlay.hidden = true;
				return;
			}

			// Use only a route sample close to the boat and current time; never
			// silently display a distant or future waypoint as current wind.
			const sample = routeForecast.filter(item => item.values && Math.abs(item.eta.getTime() - now) <= 90 * 60000 && haversineNm(fix, item) <= 10).sort((a, b) => haversineNm(fix, a) - haversineNm(fix, b))[0];

			const direction = sample
			? windIndicatorField === 'directionAverage'
				? groupValue('directionAverage', sample.values)
				: fieldDirection(windIndicatorField, sample.values)
			: null;

			if (direction === null) {
				if (windIndicatorOverlay) windIndicatorOverlay.hidden = true;
				return;
			}

			if (!windIndicatorOverlay) {
				windIndicatorOverlay = document.createElement('div');
				windIndicatorOverlay.className = 'route-wind-indicator';
				windIndicatorOverlay.innerHTML = '<b class="route-wind-degrees"></b><svg viewBox="0 0 26 30" aria-hidden="true"><path d="M2 2 L24 2 L13 28 Z" fill="#087bd1" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg><span>T</span>';
				map.getContainer().appendChild(windIndicatorOverlay);
			}

			const origin = map.latLngToContainerPoint([fix.lat, fix.lon]);

			const bearing = (_c = (_b = (_a = map.maplibreMap) === null || _a === void 0
			? void 0
			: _a.getBearing) === null || _b === void 0
			? void 0
			: _b.call(_a)) !== null && _c !== void 0
			? _c
			: 0;

			const screenDirection = (direction - bearing) * Math.PI / 180;
			windIndicatorOverlay.style.left = `${origin.x + windIndicatorDistance * Math.sin(screenDirection)}px`;
			windIndicatorOverlay.style.top = `${origin.y - windIndicatorDistance * Math.cos(screenDirection)}px`;
			windIndicatorOverlay.style.setProperty('--wind-indicator-size', `${windIndicatorSize}px`);
			windIndicatorOverlay.style.setProperty('--wind-indicator-height', `${windIndicatorSize * 30 / 26}px`);
			windIndicatorOverlay.style.setProperty('--wind-indicator-padding', `${windIndicatorSize * 5 / 26}px`);
			windIndicatorOverlay.style.setProperty('--wind-indicator-text-size', `${windIndicatorTextSize}px`);
			const triangle = windIndicatorOverlay.querySelector('svg');
			if (triangle) triangle.style.transform = `rotate(${direction - bearing}deg)`;
			const label = windIndicatorOverlay.querySelector('span');
			if (label) label.style.transform = `rotate(${direction - bearing}deg)`;
			const degreesLabel = windIndicatorOverlay.querySelector('.route-wind-degrees');

			if (degreesLabel) {
				degreesLabel.textContent = String(Math.round(direction) % 360).padStart(3, '0');
				degreesLabel.hidden = !windIndicatorDegreesEnabled;
				const labelOffset = windIndicatorSize * 0.5 + 10;
				degreesLabel.style.left = `calc(50% + ${labelOffset * Math.sin(screenDirection)}px)`;
				degreesLabel.style.top = `calc(50% - ${labelOffset * Math.cos(screenDirection)}px)`;
				degreesLabel.style.transform = `translate(-50%, -50%) rotate(${direction - bearing}deg)`;
			}

			windIndicatorOverlay.title = `Viento previsto desde ${Math.round(direction)}°`;
			windIndicatorOverlay.hidden = false;
		}

		function redrawWaveIndicator() {
			var _a, _b, _c;
			const fix = navigationFix;
			const now = Date.now();

			if (!navigationActive || !fix || now - fix.timestamp > 30000 || !waveIndicatorField) {
				if (waveIndicatorOverlay) waveIndicatorOverlay.hidden = true;
				return;
			}

			const sample = routeForecast.filter(item => item.values && Math.abs(item.eta.getTime() - now) <= 90 * 60000 && haversineNm(fix, item) <= 10).sort((a, b) => haversineNm(fix, a) - haversineNm(fix, b))[0];

			const direction = sample
			? fieldDirection(waveIndicatorField, sample.values)
			: null;

			if (direction === null) {
				if (waveIndicatorOverlay) waveIndicatorOverlay.hidden = true;
				return;
			}

			if (!waveIndicatorOverlay) {
				waveIndicatorOverlay = document.createElement('div');
				waveIndicatorOverlay.className = 'route-wind-indicator route-wave-indicator';
				waveIndicatorOverlay.innerHTML = '<b class="route-wind-degrees"></b><svg viewBox="0 0 26 30" aria-hidden="true"><path d="M2 2 L24 2 L13 28 Z" fill="#f4d03f" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg><span>W</span>';
				map.getContainer().appendChild(waveIndicatorOverlay);
			}

			const origin = map.latLngToContainerPoint([fix.lat, fix.lon]);

			const bearing = (_c = (_b = (_a = map.maplibreMap) === null || _a === void 0
			? void 0
			: _a.getBearing) === null || _b === void 0
			? void 0
			: _b.call(_a)) !== null && _c !== void 0
			? _c
			: 0;

			const screenDirection = (direction - bearing) * Math.PI / 180;
			waveIndicatorOverlay.style.left = `${origin.x + waveIndicatorDistance * Math.sin(screenDirection)}px`;
			waveIndicatorOverlay.style.top = `${origin.y - waveIndicatorDistance * Math.cos(screenDirection)}px`;
			waveIndicatorOverlay.style.setProperty('--wind-indicator-size', `${waveIndicatorSize}px`);
			waveIndicatorOverlay.style.setProperty('--wind-indicator-height', `${waveIndicatorSize * 30 / 26}px`);
			waveIndicatorOverlay.style.setProperty('--wind-indicator-padding', `${waveIndicatorSize * 5 / 26}px`);
			waveIndicatorOverlay.style.setProperty('--wind-indicator-text-size', `${waveIndicatorTextSize}px`);
			const triangle = waveIndicatorOverlay.querySelector('svg');
			if (triangle) triangle.style.transform = `rotate(${direction - bearing}deg)`;
			const label = waveIndicatorOverlay.querySelector('span');
			if (label) label.style.transform = `rotate(${direction - bearing}deg)`;
			const degreesLabel = waveIndicatorOverlay.querySelector('.route-wind-degrees');

			if (degreesLabel) {
				degreesLabel.textContent = String(Math.round(direction) % 360).padStart(3, '0');
				degreesLabel.hidden = !waveIndicatorDegreesEnabled;
				const labelOffset = waveIndicatorSize * 0.5 + 10;
				degreesLabel.style.left = `calc(50% + ${labelOffset * Math.sin(screenDirection)}px)`;
				degreesLabel.style.top = `calc(50% - ${labelOffset * Math.cos(screenDirection)}px)`;
				degreesLabel.style.transform = `translate(-50%, -50%) rotate(${direction - bearing}deg)`;
			}

			waveIndicatorOverlay.title = `Olas desde ${Math.round(direction)}`;
			waveIndicatorOverlay.hidden = false;
		}

		function redrawWindRose() {
			var _a, _b, _c, _d;
			const fix = navigationFix;
			const hasCurrentFix = navigationActive && !!fix && Date.now() - fix.timestamp <= 30000;

			if (!hasCurrentFix) {
				if (windRoseOverlay) windRoseOverlay.hidden = true;
				if (headingDegreesOverlay) headingDegreesOverlay.hidden = true;
				return;
			}

			if (windRoseEnabled && !windRoseOverlay) {
				windRoseOverlay = document.createElement('div');
				windRoseOverlay.className = 'route-wind-rose';
				map.getContainer().appendChild(windRoseOverlay);
			}

			const radius = windRoseRadius;
			const center = radius;

			const labels = windRoseLabelMode === 'cardinal'
			? [
					'N',
					'NNE',
					'NE',
					'ENE',
					'E',
					'ESE',
					'SE',
					'SSE',
					'S',
					'SSO',
					'SO',
					'OSO',
					'O',
					'ONO',
					'NO',
					'NNO'
				]
			: Array.from({ length: 12 }, (_, index) => String(index * 30).padStart(3, '0'));

			const labelStepDegrees = windRoseLabelMode === 'cardinal' ? 22.5 : 30;

			const bearing = (_c = (_b = (_a = map.maplibreMap) === null || _a === void 0
			? void 0
			: _a.getBearing) === null || _b === void 0
			? void 0
			: _b.call(_a)) !== null && _c !== void 0
			? _c
			: 0;

			const signature = `${radius}|${windRoseLineWidth}|${windRoseFontSize}|${windRoseTransparency}|${windRoseLabelMode}`;

			if (windRoseEnabled && windRoseOverlay && signature !== windRoseSignature) {
				const tickLength = Math.max(4, Math.min(9, windRoseFontSize * 0.9));

				const marks = labels.map((label, index) => {
					const angleDegrees = index * labelStepDegrees;
					const angle = angleDegrees * Math.PI / 180;
					const outer = radius - windRoseLineWidth / 2;
					const inner = outer - tickLength;

					const x1 = center + inner * Math.sin(angle),
						y1 = center - inner * Math.cos(angle);

					const x2 = center + outer * Math.sin(angle),
						y2 = center - outer * Math.cos(angle);

					const labelRadius = Math.max(2, radius - windRoseLineWidth / 2);

					const x = center + labelRadius * Math.sin(angle),
						y = center - labelRadius * Math.cos(angle);

					return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="${Math.max(1, windRoseLineWidth * 0.3)}"/><text x="${x}" y="${y}" transform="rotate(${angleDegrees} ${x} ${y})" text-anchor="middle" dominant-baseline="central" fill="#000" font-family="Arial,sans-serif" font-size="${windRoseFontSize}" font-weight="700">${label}</text>`;
				}).join('');

				const separators = windRoseLabelMode === 'degrees'
				? Array.from({ length: 12 }, (_, index) => {
						const angle = (index * 30 + 15) * Math.PI / 180;
						const separatorRadius = Math.max(1, radius - windRoseLineWidth / 2);

						const x = center + separatorRadius * Math.sin(angle),
							y = center - separatorRadius * Math.cos(angle);

						return `<circle cx="${x}" cy="${y}" r="${Math.max(0.8, windRoseFontSize * 0.12)}" fill="#000"/>`;
					}).join('')
				: '';

				windRoseOverlay.innerHTML = `<svg width="${radius * 2}" height="${radius * 2}" viewBox="0 0 ${radius * 2} ${radius * 2}" style="opacity:${1 - windRoseTransparency / 100}" aria-hidden="true"><circle cx="${center}" cy="${center}" r="${Math.max(1, radius - windRoseLineWidth / 2)}" fill="none" stroke="#fff" stroke-width="${windRoseLineWidth}"/><g class="route-wind-rose-marks">${marks}${separators}</g></svg>`;
				windRoseSignature = signature;
			}

			const origin = map.latLngToContainerPoint([fix.lat, fix.lon]);

			if (windRoseOverlay) {
				(_d = windRoseOverlay.querySelector('.route-wind-rose-marks')) === null || _d === void 0
				? void 0
				: _d.setAttribute('transform', `rotate(${-bearing} ${center} ${center})`);

				windRoseOverlay.style.left = `${origin.x}px`;
				windRoseOverlay.style.top = `${origin.y}px`;
				windRoseOverlay.hidden = !windRoseEnabled;
			}

			if (!headingDegreesEnabled || fix.heading === null || !Number.isFinite(fix.heading)) {
				if (headingDegreesOverlay) headingDegreesOverlay.hidden = true;
				return;
			}

			if (!headingDegreesOverlay) {
				headingDegreesOverlay = document.createElement('div');
				headingDegreesOverlay.className = 'route-heading-degrees';
				map.getContainer().appendChild(headingDegreesOverlay);
			}

			const screenHeading = (fix.heading - bearing) * Math.PI / 180;
			headingDegreesOverlay.textContent = String(Math.round(fix.heading) % 360).padStart(3, '0');
			headingDegreesOverlay.title = `Rumbo GPS ${Math.round(fix.heading)}°`;
			const headingRadius = Math.max(1, radius - windRoseLineWidth / 2);
			headingDegreesOverlay.style.left = `${origin.x + headingRadius * Math.sin(screenHeading)}px`;
			headingDegreesOverlay.style.top = `${origin.y - headingRadius * Math.cos(screenHeading)}px`;
			headingDegreesOverlay.style.width = `${headingDegreesWidth}px`;
			headingDegreesOverlay.style.height = `${headingDegreesHeight}px`;
			headingDegreesOverlay.style.fontSize = `${headingDegreesFontSize}px`;
			headingDegreesOverlay.style.transform = `translate(-50%, -50%) rotate(${fix.heading - bearing}deg)`;
			headingDegreesOverlay.hidden = false;
		}

		function redrawLaylines() {
			const removeLayers = layers => {
				for (const layer of layers) layer.removeFrom(map);
				layers.length = 0;
			};

			removeLayers(upwindLaylineLayers);
			removeLayers(downwindLaylineLayers);
			const fix = navigationFix;
			const now = Date.now();
			if (laylineMode === 'none' || !navigationActive || !fix || now - fix.timestamp > 30000 || !windIndicatorField) return;
			const sample = routeForecast.filter(item => item.values && Math.abs(item.eta.getTime() - now) <= 90 * 60000 && haversineNm(fix, item) <= 10).sort((a, b) => haversineNm(fix, a) - haversineNm(fix, b))[0];

			const windFrom = sample
			? windIndicatorField === 'directionAverage'
				? groupValue('directionAverage', sample.values)
				: fieldDirection(windIndicatorField, sample.values)
			: null;

			if (windFrom === null) return;
			let showUpwind = laylineMode === 'upwind' || laylineMode === 'both';
			let showDownwind = laylineMode === 'downwind' || laylineMode === 'both';

			if (laylineMode === 'automatic') {
				const course = fix.heading;
				if (course === null || course === undefined || !Number.isFinite(course)) return;
				const windAngle = Math.abs((course - windFrom + 540) % 360 - 180);
				showUpwind = windAngle <= 90;
				showDownwind = !showUpwind;
			}

			const drawPair = (angle, layers) => {
				// Colors are relative to the selected wind axis: babor green, estribor red.
				for (const [bearing, color] of [
					[windFrom - angle, portWindLaylineColor],
					[windFrom + angle, starboardWindLaylineColor]
				]) {
					const end = destinationAtBearing(fix, (bearing + 360) % 360, 600);

					layers.push(L.polyline([[fix.lat, fix.lon], [end.lat, end.lon]], {
						color,
						weight: 2,
						opacity: 0.95,
						interactive: false
					}).addTo(map));
				}
			};

			if (showUpwind) drawPair(upwindLaylineAngle, upwindLaylineLayers);
			if (showDownwind) drawPair(downwindLaylineAngle, downwindLaylineLayers);
		}

		function redrawGpsCourseLine() {
			const fix = navigationFix;

			if (!navigationActive || !fix || Date.now() - fix.timestamp > 30000 || fix.heading === null || !Number.isFinite(fix.heading)) {
				if (gpsCourseOverlay) gpsCourseOverlay.hidden = true;
				return;
			}

			if (!gpsCourseOverlay) {
				gpsCourseOverlay = document.createElement('div');

				Object.assign(gpsCourseOverlay.style, {
					position: 'absolute',
					inset: '0',
					overflow: 'hidden',
					pointerEvents: 'none',
					zIndex: '450'
				});

				gpsCourseLine = document.createElement('div');

				Object.assign(gpsCourseLine.style, {
					position: 'absolute',
					height: '2px',
					background: '#800020',
					opacity: '0.95',
					transformOrigin: '0 50%',
					pointerEvents: 'none'
				});

				gpsCourseOverlay.appendChild(gpsCourseLine);
				map.getContainer().appendChild(gpsCourseOverlay);
			}

			gpsCourseOverlay.hidden = false;
			const origin = map.latLngToContainerPoint([fix.lat, fix.lon]);
			const size = map.getSize();
			const length = Math.hypot(size.x, size.y) + Math.hypot(origin.x, origin.y) + 2;

			if (gpsCourseLine) {
				gpsCourseLine.style.left = `${origin.x}px`;
				gpsCourseLine.style.top = `${origin.y - 1}px`;
				gpsCourseLine.style.width = `${length}px`;
				gpsCourseLine.style.transform = `rotate(${fix.heading - 90}deg)`;
			}
		}

		function centerBoatInVisibleMap() {
			var _a, _b, _c, _d, _e, _f;
			const requestVersion = ++centerRequestVersion;
			const fix = navigationFix;

			if (!navigationActive || !fix || Date.now() - fix.timestamp > 30000) {
				updateForecastStatus('No hay una posición GPS reciente para centrar el mapa.');
				return;
			}

			const rect = map.getContainer().getBoundingClientRect();
			const view = window.visualViewport;

			const viewport = {
				left: (_a = view === null || view === void 0
				? void 0
				: view.offsetLeft) !== null && _a !== void 0
				? _a
				: 0,
				top: (_b = view === null || view === void 0
				? void 0
				: view.offsetTop) !== null && _b !== void 0
				? _b
				: 0,
				right: ((_c = view === null || view === void 0
				? void 0
				: view.offsetLeft) !== null && _c !== void 0
				? _c
				: 0) + ((_d = view === null || view === void 0 ? void 0 : view.width) !== null && _d !== void 0
				? _d
				: window.innerWidth),
				bottom: ((_e = view === null || view === void 0
				? void 0
				: view.offsetTop) !== null && _e !== void 0
				? _e
				: 0) + ((_f = view === null || view === void 0 ? void 0 : view.height) !== null && _f !== void 0
				? _f
				: window.innerHeight)
			};

			const nav = navigationPanel && !navigationPanel.hidden
			? navigationPanel.getBoundingClientRect()
			: null;

			let drawer = forecastDrawer && !forecastDrawer.hidden && forecastDrawer.classList.contains('is-open')
			? forecastDrawer.getBoundingClientRect()
			: null;

			const callout = forecastDrawer === null || forecastDrawer === void 0
			? void 0
			: forecastDrawer.querySelector('.departure-timebar-callout');

			if (drawer && callout && callout.getClientRects().length) {
				const label = callout.getBoundingClientRect();

				drawer = {
					left: drawer.left,
					right: drawer.right,
					top: Math.min(drawer.top, label.top),
					bottom: drawer.bottom
				};
			}

			const target = visibleMapCenter(rect, viewport, nav, drawer);

			if (!target) {
				updateForecastStatus('No hay espacio visible suficiente para centrar el barco.');
				return;
			}

			// Windy's Leaflet-compatible map is backed by MapLibre. Move its camera
			// and apply the offset together, avoiding a separate pan being lost.
			const camera = map.maplibreMap;

			if (camera && typeof camera.easeTo === 'function') {
				const cameraRect = camera.getContainer().getBoundingClientRect();
				const desiredX = rect.left + target.x - cameraRect.left;
				const desiredY = rect.top + target.y - cameraRect.top;
				const projected = camera.project([fix.lon, fix.lat]);
				if (Math.hypot(projected.x - desiredX, projected.y - desiredY) < 2) return;

				camera.easeTo({
					center: [fix.lon, fix.lat],
					offset: [desiredX - cameraRect.width / 2, desiredY - cameraRect.height / 2],
					duration: 0
				});

				return;
			}

			const boat = map.latLngToContainerPoint([fix.lat, fix.lon]);
			if (Math.hypot(boat.x - target.x, boat.y - target.y) < 2) return;

			// First move the Windy camera directly to GPS, then offset its center
			// so the boat lands in the unobscured portion of the map.
			map.setView([fix.lat, fix.lon], map.getZoom(), { animate: false });

			window.requestAnimationFrame(() => {
				if (requestVersion !== centerRequestVersion || !followBoat || !navigationActive || !navigationFix) return;
				const actual = map.latLngToContainerPoint([navigationFix.lat, navigationFix.lon]);
				map.panBy(L.point(actual.x - target.x, actual.y - target.y), { animate: false });
			});
		}

		function setFollowBoat(enabled) {
			followBoat = enabled;
			if (!enabled) centerRequestVersion++;

			centerButton === null || centerButton === void 0
			? void 0
			: centerButton.setAttribute('aria-pressed', String(enabled));

			if (centerButton) centerButton.title = enabled
			? 'Desactivar centrado automático'
			: 'Centrar el barco en el mapa visible';
		}

		function stopFollowingOnMapDrag() {
			if (followBoat) setFollowBoat(false);
		}

		function scheduleCenterForLayoutChange() {
			if (!followBoat || centerLayoutFrame !== null) return;

			centerLayoutFrame = window.requestAnimationFrame(() => {
				centerLayoutFrame = null;
				if (followBoat) centerBoatInVisibleMap();
			});
		}

		function removePoint(key) {
			const index = points.findIndex(point => String(point.id) === key);
			if (index < 0) return;
			$$invalidate(0, points = points.filter(point => String(point.id) !== key));

			// Removing a waypoint only invalidates samples whose route position or
			// passage time changed. Keep the prior samples available for matching.
			recalculate(true, true);
		}

		function clearRoute() {
			$$invalidate(0, points = []);
			navigationTargetId = null;
			waypointArrivalConfirmations = 0;
			updateNavigationPanel();
			invalidateForecast();
			redrawMap();
			saveRoute();
			$$invalidate(2, forecastMessage = 'Agrega al menos dos Waypoints para consultar el pronóstico.');
			renderForecastDrawer();
		}

		const onopen = location => {
			const restored = restoreRoute();

			if (!restored) {
				const center = map.getCenter();

				const lat = Number(location === null || location === void 0
				? void 0
				: location.lat);

				const lon = Number(location === null || location === void 0
				? void 0
				: location.lon);

				const start = hasValidCoordinates(lat, lon)
				? { lat, lon }
				: { lat: center.lat, lon: center.lng };

				$$invalidate(0, points = [
					{
						id: nextPointId++,
						lat: start.lat,
						lon: start.lon
					}
				]);
			}

			recalculate();
			activeWindowCondition = null;

			if (forecastDrawer) {
				forecastDrawer.classList.add('is-open');
				forecastDrawer.hidden = false;
				if (forecastReopenButton) forecastReopenButton.hidden = true;

				if (points.length >= 2) void calculateRouteForecast(); else {
					$$invalidate(2, forecastMessage = 'Agrega al menos dos Waypoints para consultar el pronóstico.');
					renderForecastDrawer();
				}
			}
		};

		function getWindyDocuments() {
			const documents = [document];

			try {
				const mapDocument = map.getContainer().ownerDocument;
				if (mapDocument && !documents.includes(mapDocument)) documents.push(mapDocument);
			} catch(_a) {
				
			} // The map may not be mounted yet during plugin initialization.

			try {
				const parentDocument = window.parent.document;
				if (parentDocument && !documents.includes(parentDocument)) documents.push(parentDocument);
			} catch(_b) {
				
			} // Windy may isolate the plugin in a cross-origin frame.

			return documents;
		}

		function setForecastOpenState(open) {
			var _a, _b;

			for (const windyDocument of getWindyDocuments()) {
				(_a = windyDocument.body) === null || _a === void 0
				? void 0
				: _a.classList.toggle('route-builder-forecast-open', open);

				(_b = windyDocument.documentElement) === null || _b === void 0
				? void 0
				: _b.classList.toggle('route-builder-forecast-open', open);
			}
		}

		onMount(() => {
			var _b, _c, _d, _e, _f, _g, _h, _j, _k;

			const controlsCss = `
            #home, #mobile-home, #home-button, #search, #logo-wrapper, #menu,
            #mobile-ovr-select, #embed-zoom,
            [data-plugin="bottom-controls-mobile"],
            [data-plugin="bottom-controls-desktop"],
            [data-plugin="home"], [data-plugin="search"], [data-plugin="menu"],
            .plugin-home, .mobile-home, .mobile-home-button,
            .leaflet-top.leaflet-right, .maplibregl-ctrl-top-right {
                display: none !important;
            }
        `;

			for (const windyDocument of getWindyDocuments()) {
				let style = windyDocument.getElementById('route-builder-windy-controls-style');

				if (!style) {
					style = windyDocument.createElement('style');
					style.id = 'route-builder-windy-controls-style';
					style.textContent = controlsCss;

					(_b = windyDocument.head) === null || _b === void 0
					? void 0
					: _b.appendChild(style);
				}

				windyControlsStyles.push(style);
			}

			try {
				routeSnapshotActions = routeSnapshotKeys.map(key => parseRouteSnapshot(localStorage.getItem(key))
				? 'load'
				: 'save');

				try {
					const storedArrival = JSON.parse(localStorage.getItem('route-builder-arrival-selection-v1') || '{}');

					if (Array.isArray(storedArrival.hours)) arrivalHours = [
						...new Set(storedArrival.hours.filter(v => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 24))
					];

					if (Array.isArray(storedArrival.days)) arrivalDays = [
						...new Set(storedArrival.days.filter(v => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 7))
					];
				} catch(_l) {
					arrivalHours = [];
					arrivalDays = [];
				}

				try {
					const savedDirections = JSON.parse(localStorage.getItem('route-builder-direction-selections-v1') || '{}');

					for (const key of windowFieldKeys) if (hasDirectionWheel(key) && Array.isArray(savedDirections[key])) directionSelections[key] = [
						...new Set(savedDirections[key].filter(item => typeof item === 'number' && Number.isInteger(item) && item >= 0 && item < 8))
					];
				} catch(_m) {
					directionSelections = {};
				}

				$$invalidate(20, showWaypointDate = localStorage.getItem('route-builder-show-waypoint-date') !== 'false');
				$$invalidate(21, showWaypointHour = localStorage.getItem('route-builder-show-waypoint-hour') !== 'false');
				const legacyWaypointPosition = localStorage.getItem('route-builder-waypoint-label-position');

				waypointDatePosition = localStorage.getItem('route-builder-waypoint-date-position') === 'above' || !localStorage.getItem('route-builder-waypoint-date-position') && legacyWaypointPosition === 'above'
				? 'above'
				: 'below';

				waypointHourPosition = localStorage.getItem('route-builder-waypoint-hour-position') === 'above' || !localStorage.getItem('route-builder-waypoint-hour-position') && legacyWaypointPosition === 'above'
				? 'above'
				: 'below';

				$$invalidate(26, showSegmentTime = localStorage.getItem('route-builder-show-segment-time') !== 'false');
				$$invalidate(27, showSegmentBearing = localStorage.getItem('route-builder-show-segment-bearing') !== 'false');
				$$invalidate(28, showSegmentDistance = localStorage.getItem('route-builder-show-segment-distance') !== 'false');
				const legacySegmentPosition = localStorage.getItem('route-builder-segment-label-position');

				$$invalidate(29, segmentTimePosition = localStorage.getItem('route-builder-segment-time-position') === 'below' || !localStorage.getItem('route-builder-segment-time-position') && legacySegmentPosition === 'below'
				? 'below'
				: 'above');

				$$invalidate(30, segmentBearingPosition = localStorage.getItem('route-builder-segment-bearing-position') === 'below' || !localStorage.getItem('route-builder-segment-bearing-position') && legacySegmentPosition === 'below'
				? 'below'
				: 'above');

				$$invalidate(31, segmentDistancePosition = localStorage.getItem('route-builder-segment-distance-position') === 'below' || !localStorage.getItem('route-builder-segment-distance-position') && legacySegmentPosition === 'below'
				? 'below'
				: 'above');

				$$invalidate(22, showWaypointDistanceAccumulated = localStorage.getItem('route-builder-show-waypoint-distance-accumulated') !== 'false');
				$$invalidate(23, showWaypointTimeAccumulated = localStorage.getItem('route-builder-show-waypoint-time-accumulated') !== 'false');
				$$invalidate(24, showWaypointDistanceRemaining = localStorage.getItem('route-builder-show-waypoint-distance-remaining') !== 'false');
				$$invalidate(25, showWaypointTimeRemaining = localStorage.getItem('route-builder-show-waypoint-time-remaining') !== 'false');

				waypointDatePosition = localStorage.getItem('route-builder-waypoint-date-position') === 'above'
				? 'above'
				: 'below';

				waypointHourPosition = localStorage.getItem('route-builder-waypoint-hour-position') === 'above'
				? 'above'
				: 'below';

				$$invalidate(32, waypointFieldPositions['waypoint-date'] = waypointDatePosition, waypointFieldPositions);
				$$invalidate(32, waypointFieldPositions['waypoint-hour'] = waypointHourPosition, waypointFieldPositions);

				for (const field of waypointLabelFields.slice(2)) {
					$$invalidate(
						32,
						waypointFieldPositions[field] = localStorage.getItem(`route-builder-${field}-position`) === 'above'
						? 'above'
						: 'below',
						waypointFieldPositions
					);
				}

				const waypointOrder = JSON.parse(localStorage.getItem('route-builder-waypoint-field-order') || 'null');

				if (Array.isArray(waypointOrder)) {
					const validOrder = waypointOrder.filter((field, index) => waypointLabelFields.includes(field) && waypointOrder.indexOf(field) === index);

					$$invalidate(33, waypointFieldOrder = [
						...validOrder,
						...waypointLabelFields.filter(field => !validOrder.includes(field))
					]);
				}

				const segmentOrder = JSON.parse(localStorage.getItem('route-builder-segment-field-order') || 'null');
				if (Array.isArray(segmentOrder) && segmentOrder.length === 3 && segmentOrder.every(field => ['segment-time', 'segment-bearing', 'segment-distance'].includes(field))) $$invalidate(34, segmentFieldOrder = segmentOrder);
				const savedRouteFieldOrder = JSON.parse(localStorage.getItem('route-builder-forecast-field-order') || 'null');

				if (Array.isArray(savedRouteFieldOrder)) {
					const validOrder = savedRouteFieldOrder.filter((field, index) => windowFieldKeys.includes(field) && savedRouteFieldOrder.indexOf(field) === index);

					routeFieldOrder = [
						...validOrder,
						...windowFieldKeys.filter(field => !validOrder.includes(field))
					];

					const averageIndex = routeFieldOrder.indexOf('windAverage');
					const firstWindIndex = routeFieldOrder.findIndex(field => windModelFieldKeys.includes(field));

					if (averageIndex >= 0 && firstWindIndex >= 0 && averageIndex > firstWindIndex) {
						routeFieldOrder.splice(averageIndex, 1);
						routeFieldOrder.splice(firstWindIndex, 0, 'windAverage');
					}
				}

				try {
					collapsedGroups = JSON.parse(localStorage.getItem('route-builder-model-groups-collapsed') || '{}');
				} catch(_o) {
					collapsedGroups = {};
				}

				for (const groupKey of Object.keys(additionalGroups)) {
					if (!windowFieldKeys.includes(groupKey)) continue;

					if (!(savedRouteFieldOrder === null || savedRouteFieldOrder === void 0
					? void 0
					: savedRouteFieldOrder.includes(groupKey))) {
						routeFieldOrder = routeFieldOrder.filter(field => field !== groupKey);
						const index = routeFieldOrder.findIndex(field => additionalGroups[groupKey].fields.includes(field));
						routeFieldOrder.splice(Math.max(0, index), 0, groupKey);
					}
				}

				windModelRowsCollapsed = localStorage.getItem('route-builder-wind-model-rows-collapsed') !== 'false';
				const savedHiddenRouteFields = JSON.parse(localStorage.getItem('route-builder-forecast-hidden-fields') || '[]');

				if (Array.isArray(savedHiddenRouteFields)) {
					hiddenRouteFields = new Set(savedHiddenRouteFields.filter(field => field !== 'windAverage' && !additionalGroups[field] && windowFieldKeys.includes(field)));

					for (const field of [...newModelFields, ...skyModelFields]) if (!(savedRouteFieldOrder === null || savedRouteFieldOrder === void 0
					? void 0
					: savedRouteFieldOrder.includes(field))) hiddenRouteFields.add(field);
				}

				const savedWindIndicator = localStorage.getItem('route-builder-wind-indicator-field');
				windIndicatorUserChoice = savedWindIndicator !== null;

				const legacyWindIndicator = {
					wind: 'direction',
					ecmwfWind: 'ecmwfWindDirection',
					mblueWind: 'mblueWindDirection',
					iconWind: 'iconWindDirection',
					aromeWind: 'aromeWindDirection',
					windAverage: 'directionAverage'
				};

				const directionIndicator = savedWindIndicator
				? (_c = legacyWindIndicator[savedWindIndicator]) !== null && _c !== void 0
					? _c
					: savedWindIndicator
				: null;

				windIndicatorField = directionIndicator && windIndicatorOptions().includes(directionIndicator)
				? directionIndicator
				: '';

				const savedWindDistance = Number(localStorage.getItem('route-builder-wind-indicator-distance'));
				const savedWindSize = Number(localStorage.getItem('route-builder-wind-indicator-size'));
				const savedWindTextSize = Number(localStorage.getItem('route-builder-wind-indicator-text-size'));
				if (savedWindDistance >= 20 && savedWindDistance <= 200) windIndicatorDistance = savedWindDistance;
				if (savedWindSize >= 16 && savedWindSize <= 80) windIndicatorSize = savedWindSize;
				if (savedWindTextSize >= 6 && savedWindTextSize <= 40) windIndicatorTextSize = savedWindTextSize;
				const savedWindDegrees = localStorage.getItem('route-builder-wind-indicator-degrees');
				if (savedWindDegrees !== null) windIndicatorDegreesEnabled = savedWindDegrees !== 'false';
				const savedWaveIndicator = localStorage.getItem('route-builder-wave-indicator-field');
				waveIndicatorUserChoice = savedWaveIndicator !== null;

				waveIndicatorField = savedWaveIndicator && waveIndicatorOptions().includes(savedWaveIndicator)
				? savedWaveIndicator
				: '';

				const savedWaveDistance = Number(localStorage.getItem('route-builder-wave-indicator-distance'));
				const savedWaveSize = Number(localStorage.getItem('route-builder-wave-indicator-size'));
				const savedWaveTextSize = Number(localStorage.getItem('route-builder-wave-indicator-text-size'));
				if (savedWaveDistance >= 20 && savedWaveDistance <= 200) waveIndicatorDistance = savedWaveDistance;
				if (savedWaveSize >= 16 && savedWaveSize <= 80) waveIndicatorSize = savedWaveSize;
				if (savedWaveTextSize >= 6 && savedWaveTextSize <= 40) waveIndicatorTextSize = savedWaveTextSize;
				const savedWaveDegrees = localStorage.getItem('route-builder-wave-indicator-degrees');
				if (savedWaveDegrees !== null) waveIndicatorDegreesEnabled = savedWaveDegrees !== 'false';
				const savedWindRoseEnabled = localStorage.getItem('route-builder-wind-rose-enabled');
				if (savedWindRoseEnabled !== null) windRoseEnabled = savedWindRoseEnabled === 'true';
				const savedHeadingDegreesEnabled = localStorage.getItem('route-builder-heading-degrees-enabled');
				if (savedHeadingDegreesEnabled !== null) headingDegreesEnabled = savedHeadingDegreesEnabled === 'true';
				const savedHeadingDegreesFontSize = Number(localStorage.getItem('route-builder-heading-degrees-font-size'));
				const savedHeadingDegreesWidth = Number(localStorage.getItem('route-builder-heading-degrees-width'));
				const savedHeadingDegreesHeight = Number(localStorage.getItem('route-builder-heading-degrees-height'));
				if (Number.isFinite(savedHeadingDegreesFontSize) && savedHeadingDegreesFontSize >= 6 && savedHeadingDegreesFontSize <= 40) headingDegreesFontSize = savedHeadingDegreesFontSize;
				if (Number.isFinite(savedHeadingDegreesWidth) && savedHeadingDegreesWidth >= 30 && savedHeadingDegreesWidth <= 200) headingDegreesWidth = savedHeadingDegreesWidth;
				if (Number.isFinite(savedHeadingDegreesHeight) && savedHeadingDegreesHeight >= 16 && savedHeadingDegreesHeight <= 100) headingDegreesHeight = savedHeadingDegreesHeight;
				const savedWindSettingsOpen = localStorage.getItem('route-builder-wind-settings-open');
				const savedWaveSettingsOpen = localStorage.getItem('route-builder-wave-settings-open');
				const savedLaylineSettingsOpen = localStorage.getItem('route-builder-layline-settings-open');
				const savedRoseSettingsOpen = localStorage.getItem('route-builder-wind-rose-settings-open');
				if (savedWindSettingsOpen !== null) windIndicatorSettingsOpen = savedWindSettingsOpen === 'true';
				if (savedWaveSettingsOpen !== null) waveIndicatorSettingsOpen = savedWaveSettingsOpen === 'true';
				if (savedLaylineSettingsOpen !== null) laylinesSettingsOpen = savedLaylineSettingsOpen === 'true';
				if (savedRoseSettingsOpen !== null) windRoseSettingsOpen = savedRoseSettingsOpen === 'true';
				const savedWindRoseRadius = Number(localStorage.getItem('route-builder-wind-rose-radius'));
				const savedWindRoseWidth = Number(localStorage.getItem('route-builder-wind-rose-width'));
				const savedWindRoseFontSize = Number(localStorage.getItem('route-builder-wind-rose-font-size'));
				const savedWindRoseTransparencyValue = localStorage.getItem('route-builder-wind-rose-transparency');

				const savedWindRoseTransparency = savedWindRoseTransparencyValue === null
				? NaN
				: Number(savedWindRoseTransparencyValue);

				if (Number.isFinite(savedWindRoseRadius) && savedWindRoseRadius >= 20 && savedWindRoseRadius <= 200) windRoseRadius = savedWindRoseRadius;
				if (Number.isFinite(savedWindRoseWidth) && savedWindRoseWidth >= 1 && savedWindRoseWidth <= 20) windRoseLineWidth = savedWindRoseWidth;
				if (Number.isFinite(savedWindRoseFontSize) && savedWindRoseFontSize >= 4 && savedWindRoseFontSize <= 24) windRoseFontSize = savedWindRoseFontSize;
				if (Number.isFinite(savedWindRoseTransparency) && savedWindRoseTransparency >= 0 && savedWindRoseTransparency <= 100) windRoseTransparency = savedWindRoseTransparency;
				const savedWindRoseLabelMode = localStorage.getItem('route-builder-wind-rose-label-mode');
				if (savedWindRoseLabelMode === 'cardinal' || savedWindRoseLabelMode === 'degrees') windRoseLabelMode = savedWindRoseLabelMode;
				const storedLaylineMode = localStorage.getItem('route-builder-layline-mode');
				if (storedLaylineMode && ['none', 'upwind', 'downwind', 'both', 'automatic'].includes(storedLaylineMode)) laylineMode = storedLaylineMode;
				const storedPortWindLaylineColor = localStorage.getItem('route-builder-layline-port-color');
				const storedStarboardWindLaylineColor = localStorage.getItem('route-builder-layline-starboard-color');
				if (storedPortWindLaylineColor && (/^#[\da-f]{6}$/i).test(storedPortWindLaylineColor)) portWindLaylineColor = storedPortWindLaylineColor;
				if (storedStarboardWindLaylineColor && (/^#[\da-f]{6}$/i).test(storedStarboardWindLaylineColor)) starboardWindLaylineColor = storedStarboardWindLaylineColor;
				const savedUpwindAngleValue = localStorage.getItem('route-builder-upwind-angle');
				const savedDownwindAngleValue = localStorage.getItem('route-builder-downwind-angle');

				const savedUpwindAngle = savedUpwindAngleValue === null
				? NaN
				: Number(savedUpwindAngleValue);

				const savedDownwindAngle = savedDownwindAngleValue === null
				? NaN
				: Number(savedDownwindAngleValue);

				if (Number.isFinite(savedUpwindAngle) && savedUpwindAngle >= 0 && savedUpwindAngle <= 90) upwindLaylineAngle = savedUpwindAngle;
				if (Number.isFinite(savedDownwindAngle) && savedDownwindAngle >= 90 && savedDownwindAngle <= 180) downwindLaylineAngle = savedDownwindAngle;
				const savedFont = localStorage.getItem('route-builder-distance-font');
				if (savedFont && savedFont in distanceFontStacks) $$invalidate(3, distanceFont = savedFont);
				const savedDistanceUnit = localStorage.getItem('route-builder-distance-unit');
				if (savedDistanceUnit === 'km' || savedDistanceUnit === 'nm') $$invalidate(4, distanceUnit = savedDistanceUnit);
				const savedWaypointLabelFontSize = Number(localStorage.getItem('route-builder-waypoint-label-font-size'));
				if (Number.isFinite(savedWaypointLabelFontSize) && savedWaypointLabelFontSize >= 8 && savedWaypointLabelFontSize <= 18) $$invalidate(6, waypointLabelFontSize = savedWaypointLabelFontSize);
				const savedSegmentLabelFontSize = Number(localStorage.getItem('route-builder-segment-label-font-size'));
				if (Number.isFinite(savedSegmentLabelFontSize) && savedSegmentLabelFontSize >= 8 && savedSegmentLabelFontSize <= 18) $$invalidate(7, segmentLabelFontSize = savedSegmentLabelFontSize);
				const savedWaypointSize = Number(localStorage.getItem('route-builder-waypoint-size'));

				if (Number.isFinite(savedWaypointSize) && savedWaypointSize >= 14 && savedWaypointSize <= 40) {
					$$invalidate(5, waypointSize = savedWaypointSize);
				}

				const savedSpeed = Number(localStorage.getItem('route-builder-speed-knots'));
				if (Number.isFinite(savedSpeed) && savedSpeed > 0) speedKnots = savedSpeed;
				const savedSampleIntervalHours = Number(localStorage.getItem('route-builder-sample-interval-hours'));
				const storedLiveSpeed = Number(localStorage.getItem('route-builder-live-speed-seconds'));
				const storedLiveForecast = Number(localStorage.getItem('route-builder-live-forecast-seconds'));
				const storedLiveWaypoints = Number(localStorage.getItem('route-builder-live-waypoint-seconds'));
				restorePreviousRouteOnNavExit = localStorage.getItem('route-builder-restore-previous-route-on-nav-exit') === 'true';
				if (liveSpeedOptions.includes(storedLiveSpeed)) liveSpeedSeconds = storedLiveSpeed;
				if (liveForecastOptions.includes(storedLiveForecast)) liveForecastSeconds = storedLiveForecast;
				if (liveWaypointOptions.includes(storedLiveWaypoints)) liveWaypointSeconds = storedLiveWaypoints;
				if ([1, 3, 6, 12].includes(savedSampleIntervalHours)) routeSampleIntervalHours = savedSampleIntervalHours;
				const savedSearchDays = Number(localStorage.getItem('route-builder-weather-search-days'));
				if (savedSearchDays === 7) weatherSearchDays = 15; else if ([3, 5, 10, 15].includes(savedSearchDays)) weatherSearchDays = savedSearchDays;
				const savedDrawerHeightRaw = localStorage.getItem('route-builder-drawer-max-height-percent');
				const savedDrawerHeight = Number(savedDrawerHeightRaw);
				if (savedDrawerHeightRaw !== null && savedDrawerHeightRaw.trim() !== '' && Number.isFinite(savedDrawerHeight) && savedDrawerHeight >= 0 && savedDrawerHeight <= 100) forecastDrawerMaxHeightPercent = savedDrawerHeight;
				const savedDepartureInterval = Number(localStorage.getItem('route-builder-departure-interval-hours'));
				if ([1, 2, 3, 6, 12, 24].includes(savedDepartureInterval)) departureIntervalHours = savedDepartureInterval;
				const savedConstraints = JSON.parse(localStorage.getItem('route-builder-window-constraints') || 'null');

				if (savedConstraints && typeof savedConstraints === 'object') {
					windowConstraints = Object.assign(Object.assign(Object.assign({}, windowConstraints), savedConstraints), {
						temperature: Object.assign(Object.assign({}, windowConstraints.temperature), savedConstraints.temperature),
						rain: Object.assign(Object.assign({}, windowConstraints.rain), savedConstraints.rain),
						windAverage: Object.assign(Object.assign({}, windowConstraints.windAverage), savedConstraints.windAverage),
						wind: Object.assign(Object.assign({}, windowConstraints.wind), savedConstraints.wind),
						ecmwfWind: Object.assign(Object.assign({}, windowConstraints.ecmwfWind), savedConstraints.ecmwfWind),
						mblueWind: Object.assign(Object.assign({}, windowConstraints.mblueWind), savedConstraints.mblueWind),
						iconWind: Object.assign(Object.assign({}, windowConstraints.iconWind), savedConstraints.iconWind),
						aromeWind: Object.assign(Object.assign({}, windowConstraints.aromeWind), savedConstraints.aromeWind),
						ecmwfWindDirection: Object.assign(Object.assign({}, windowConstraints.ecmwfWindDirection), savedConstraints.ecmwfWindDirection),
						mblueWindDirection: Object.assign(Object.assign({}, windowConstraints.mblueWindDirection), savedConstraints.mblueWindDirection),
						iconWindDirection: Object.assign(Object.assign({}, windowConstraints.iconWindDirection), savedConstraints.iconWindDirection),
						aromeWindDirection: Object.assign(Object.assign({}, windowConstraints.aromeWindDirection), savedConstraints.aromeWindDirection),
						gust: Object.assign(Object.assign({}, windowConstraints.gust), savedConstraints.gust),
						direction: Object.assign(Object.assign({}, windowConstraints.direction), savedConstraints.direction),
						waves: Object.assign(Object.assign({}, windowConstraints.waves), savedConstraints.waves),
						ecmwfWaves: Object.assign(Object.assign({}, windowConstraints.ecmwfWaves), savedConstraints.ecmwfWaves),
						ecmwfSwell1: Object.assign(Object.assign({}, windowConstraints.ecmwfSwell1), savedConstraints.ecmwfSwell1),
						ecmwfWavesPeriod: Object.assign(Object.assign({}, windowConstraints.ecmwfWavesPeriod), savedConstraints.ecmwfWavesPeriod),
						ecmwfWavesPower: Object.assign(Object.assign({}, windowConstraints.ecmwfWavesPower), savedConstraints.ecmwfWavesPower),
						clouds: {
							states: Array.isArray((_d = savedConstraints.clouds) === null || _d === void 0
							? void 0
							: _d.states)
							? savedConstraints.clouds.states.filter(state => skyStateOptions.some(option => option.id === state))
							: []
						},
						arrival: Object.assign(Object.assign({}, windowConstraints.arrival), savedConstraints.arrival)
					});

					const powerBoundsList = [windowConstraints.wavesPower, windowConstraints.ecmwfWavesPower];

					for (const powerBounds of powerBoundsList) for (const bound of ['min', 'max']) {
						const value = powerBounds[bound];

						if (value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value))) {
							powerBounds[bound] = Math.max(0, Math.min(20, Number(value)));
						}
					}
				} else {
					const legacyConditions = JSON.parse(localStorage.getItem('route-builder-weather-conditions') || 'null');

					if ((_e = legacyConditions === null || legacyConditions === void 0
					? void 0
					: legacyConditions.temperature) === null || _e === void 0
					? void 0
					: _e.enabled) windowConstraints.temperature = {
						min: legacyConditions.temperature.min,
						max: legacyConditions.temperature.max
					};

					if ((_f = legacyConditions === null || legacyConditions === void 0
					? void 0
					: legacyConditions.rain) === null || _f === void 0
					? void 0
					: _f.enabled) windowConstraints.rain = {
						min: legacyConditions.rain.min,
						max: legacyConditions.rain.max
					};

					if ((_g = legacyConditions === null || legacyConditions === void 0
					? void 0
					: legacyConditions.wind) === null || _g === void 0
					? void 0
					: _g.enabled) windowConstraints.wind = {
						min: legacyConditions.wind.min,
						max: legacyConditions.wind.max
					};

					if ((_h = legacyConditions === null || legacyConditions === void 0
					? void 0
					: legacyConditions.waves) === null || _h === void 0
					? void 0
					: _h.enabled) windowConstraints.waves = {
						min: legacyConditions.waves.min,
						max: legacyConditions.waves.max
					};

					if ((_j = legacyConditions === null || legacyConditions === void 0
					? void 0
					: legacyConditions.clouds) === null || _j === void 0
					? void 0
					: _j.enabled) windowConstraints.clouds.states = ['clear', 'partly-cloudy', 'mostly-cloudy', 'overcast'];
				}
			} catch(/* Storage may be unavailable in some browser modes. */ _p) {
				
			} /* Storage may be unavailable in some browser modes. */

			// Restore after preferences load so the autosaved route and its speed
			// take precedence even when Windy remounts without calling onopen.
			restoreRoute();

			waypointLayer = L.layerGroup().addTo(map);
			distanceLabelOverlay = document.createElement('div');
			distanceLabelOverlay.className = 'route-builder-label-overlay';

			Object.assign(distanceLabelOverlay.style, {
				position: 'absolute',
				inset: '0',
				zIndex: '650',
				pointerEvents: 'none',
				overflow: 'hidden'
			});

			map.getContainer().appendChild(distanceLabelOverlay);
			forecastDrawer = document.createElement('div');
			forecastDrawer.className = 'route-builder-forecast-drawer-host';
			applyForecastDrawerHeightLimit();
			forecastDrawer.classList.add('is-open');
			forecastDrawer.hidden = false;
			document.body.appendChild(forecastDrawer);
			navigationPanel = document.createElement('section');
			navigationPanel.className = 'route-navigation-dashboard';
			navigationPanel.hidden = true;
			navigationPanel.setAttribute('aria-label', 'Datos de navegación GPS');
			navigationPanel.innerHTML = `<label class="route-nav-waypoint-picker" title="Cambiar waypoint"><span class="route-nav-side-label" data-nav-value="waypoint">Waypoint</span><select data-nav-waypoint-select aria-label="Elegir próximo waypoint"></select></label><div class="route-nav-side"><div title="Rumbo al waypoint">➤ <b data-nav-value="bearing">—</b></div><div title="Distancia al waypoint">↔ <b data-nav-value="nextDistance">—</b></div><div title="Tiempo al waypoint">◷ <b data-nav-value="nextTime">—</b></div></div><div class="route-nav-center"><div class="route-nav-speed"><div class="route-nav-speed-current"><b data-nav-value="speed">—</b><small>kt</small></div><div class="route-nav-speed-average" title="Velocidad promedio estimada desde la salida sobre la ruta">Prom. <b data-nav-value="averageSpeed">—</b> kt</div></div><div class="route-nav-heading" title="Rumbo GPS" data-nav-value="heading">—</div></div><div class="route-nav-side"><div title="Tiempo a destino">◷ <b data-nav-value="finalTime">—</b></div><div title="Distancia a destino">↔ <b data-nav-value="finalDistance">—</b></div><div title="Llegada estimada">▣ <b data-nav-value="eta">—</b></div></div><span class="route-nav-side-label">Destino</span>`;

			(_k = navigationPanel.querySelector('[data-nav-waypoint-select]')) === null || _k === void 0
			? void 0
			: _k.addEventListener('change', event => {
					const id = Number(event.currentTarget.value);
					if (!points.some(point => point.id === id)) return;
					navigationTargetId = id;
					waypointArrivalConfirmations = 0;
					updateNavigationPanel();
					if (liveRouteActive) refreshLiveRoute();
				});

			document.body.appendChild(navigationPanel);

			if (typeof ResizeObserver !== 'undefined') {
				centerLayoutObserver = new ResizeObserver(scheduleCenterForLayoutChange);
				centerLayoutObserver.observe(forecastDrawer);
				centerLayoutObserver.observe(navigationPanel);
			}

			navigationRefreshTimer = window.setInterval(updateNavigationPanel, 5000);
			gpsButton = document.createElement('button');
			gpsButton.type = 'button';
			gpsButton.className = 'route-builder-gps-label-button';
			const navigationButtonIcon = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v8m0 4v8M2 12h8m4 0h8M5 5l5.6 5.6m2.8 2.8L19 19M19 5l-5.6 5.6m-2.8 2.8L5 19"/></svg>';
			gpsButton.innerHTML = navigationButtonIcon;
			gpsButton.setAttribute('aria-label', 'Modo navegación');
			gpsButton.setAttribute('aria-pressed', 'false');
			gpsButton.title = 'Activar modo Navegación';
			liveButton = document.createElement('button');
			liveButton.type = 'button';
			liveButton.className = 'route-builder-gps-label-button route-builder-live-button';
			liveButton.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M19.07 4.93l-1.42 1.42M6.35 17.65l-1.42 1.42"/></svg>';
			liveButton.setAttribute('aria-label', 'Pronóstico en vivo');
			liveButton.setAttribute('aria-pressed', 'false');
			liveButton.title = 'Cargar ruta desde la posición GPS';
			liveButton.hidden = true;
			centerButton = document.createElement('button');
			centerButton.type = 'button';
			centerButton.className = 'route-builder-gps-label-button route-builder-center-button';
			centerButton.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
			centerButton.title = 'Centrar el barco en el mapa visible';
			centerButton.setAttribute('aria-label', 'Centrar el barco en el mapa visible');
			centerButton.setAttribute('aria-pressed', 'false');
			centerButton.hidden = true;

			centerButton.addEventListener('click', event => {
				event.stopPropagation();

				if (followBoat) {
					setFollowBoat(false);
					return;
				}

				if (!navigationFix || Date.now() - navigationFix.timestamp > 30000) {
					centerBoatInVisibleMap();
					return;
				}

				setFollowBoat(true);
				centerBoatInVisibleMap();
			});

			const makeZoomButton = (label, symbol, className, delta) => {
				const button = document.createElement('button');
				button.type = 'button';
				button.className = `route-builder-gps-label-button route-builder-zoom-button ${className}`;
				button.textContent = symbol;
				button.title = label;
				button.setAttribute('aria-label', label);

				button.addEventListener('click', event => {
					event.stopPropagation();
					if (delta > 0) map.zoomIn(1, { animate: false }); else map.zoomOut(1, { animate: false });
					scheduleCenterForLayoutChange();
				});

				return button;
			};

			zoomInButton = makeZoomButton('Acercar mapa', '+', 'route-builder-zoom-in', 1);
			zoomOutButton = makeZoomButton('Alejar mapa', '−', 'route-builder-zoom-out', -1);

			liveButton.addEventListener('click', event => {
				event.stopPropagation();

				if (autoLivePending) {
					autoLivePending = false;
					updateForecastStatus('Activación automática de EN VIVO cancelada.');
					return;
				}

				if (liveRouteActive) leaveLiveRoute(false, false); else enterLiveRoute();
			});

			gpsButton.addEventListener('click', event => __awaiter(void 0, void 0, void 0, function* () {
				event.stopPropagation();
				if (!gpsButton || gpsButton.disabled) return;

				if (navigationActive) {
					if (!leaveLiveRoute(restorePreviousRouteOnNavExit, true)) return;
					navigationActive = false;
					setFollowBoat(false);
					autoLivePending = false;
					if (liveButton) liveButton.hidden = true;
					if (centerButton) centerButton.hidden = true;
					gpsRequestGeneration++;
					if (gpsWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatchId);
					gpsWatchId = null;

					gpsPositionMarker === null || gpsPositionMarker === void 0
					? void 0
					: gpsPositionMarker.removeFrom(map);

					gpsPositionMarker = null;
					navigationFix = null;
					redrawMapOverlays();
					recentGpsSpeeds = [];
					gpsCourse = null;
					gpsCourseAnchor = null;
					waypointArrivalConfirmations = 0;
					lastNavigationFixTimestamp = 0;
					if (navigationPanel) navigationPanel.hidden = true;
					gpsButton.setAttribute('aria-pressed', 'false');
					gpsButton.title = 'Activar modo Navegación';
					updateBoatTrackMarker();
					updateForecastStatus('Navegación GPS detenida.');
					return;
				}

				const requestGeneration = ++gpsRequestGeneration;
				gpsButton.disabled = true;
				gpsButton.textContent = '...';

				try {
					const position = yield getGPSlocation({
						enableHighAccuracy: true,
						timeout: 20000,
						maximumAge: 10000,
						getMeFallbackGps: false,
						doNotShowFailureMessage: true
					});

					if (requestGeneration !== gpsRequestGeneration) return;

					const lat = Number(position === null || position === void 0
						? void 0
						: position.lat),
						lon = Number(position === null || position === void 0
						? void 0
						: position.lon);

					if ((position === null || position === void 0
					? void 0
					: position.source) !== 'gps' || !hasValidCoordinates(lat, lon)) {
						updateForecastStatus('No se pudo obtener una posición GPS. Comprueba la ubicación y sus permisos.');
						return;
					}

					navigationFix = {
						lat,
						lon,
						speed: null,
						heading: null,
						timestamp: Date.now()
					};

					navigationPlanBackupActive = saveTemporaryPlan(localStorage, {
						points,
						nextPointId,
						departureDateTime,
						speedKnots
					});

					navigationActive = true;
					autoLivePending = true;
					if (liveButton) liveButton.hidden = false;
					if (centerButton) centerButton.hidden = false;
					gpsButton.setAttribute('aria-pressed', 'true');
					gpsButton.title = 'Desactivar modo Navegación';
					if (navigationPanel) navigationPanel.hidden = false;
					updateNavigationPanel();

					const icon = L.divIcon({
						className: 'route-builder-gps-position-icon',
						html: '<span></span>',
						iconSize: [22, 22],
						iconAnchor: [11, 11]
					});

					if (!gpsPositionMarker) gpsPositionMarker = L.marker([lat, lon], {
						icon,
						interactive: false,
						zIndexOffset: 1500
					}).addTo(map); else gpsPositionMarker.setLatLng([lat, lon]);

					map.setView([lat, lon], Math.max(map.getZoom(), 8));
					setFollowBoat(true);
					centerBoatInVisibleMap();
					updateForecastStatus('Posición GPS actualizada. EN VIVO espera una ruta y velocidad GPS válidas.');

					if (gpsWatchId === null && navigator.geolocation) {
						gpsWatchId = navigator.geolocation.watchPosition(
							update => {
								if (!navigationActive || requestGeneration !== gpsRequestGeneration) return;
								const { latitude, longitude, accuracy, speed } = update.coords;
								if (!gpsPositionMarker || !hasValidCoordinates(latitude, longitude) || !Number.isFinite(accuracy) || accuracy > 100) return;

								const currentFix = {
									lat: latitude,
									lon: longitude,
									accuracy,
									timestamp: update.timestamp
								};

								if (typeof speed === 'number' && Number.isFinite(speed) && speed < 0.5) {
									gpsCourse = null;
									gpsCourseAnchor = currentFix;
								} else if (!gpsCourseAnchor || currentFix.timestamp <= gpsCourseAnchor.timestamp || currentFix.timestamp - gpsCourseAnchor.timestamp > 120000) {
									gpsCourseAnchor = currentFix;
									gpsCourse = null;
								} else {
									const bearing = courseFromFixes(gpsCourseAnchor, currentFix);

									if (bearing !== null) {
										gpsCourse = {
											heading: bearing,
											timestamp: currentFix.timestamp
										};

										gpsCourseAnchor = currentFix;
									}
								}

								const heading = gpsCourse && currentFix.timestamp - gpsCourse.timestamp <= 30000
								? gpsCourse.heading
								: null;

								const hasCourse = heading !== null;

								navigationFix = {
									lat: latitude,
									lon: longitude,
									speed: typeof speed === 'number' && Number.isFinite(speed) && speed >= 0
									? speed * 1.943844
									: null,
									heading,
									timestamp: update.timestamp
								};

								recentGpsSpeeds = recentGpsSpeeds.filter(sample => sample.timestamp >= update.timestamp - 300000 && sample.timestamp <= update.timestamp);

								if (navigationFix.speed !== null) recentGpsSpeeds.push({
									timestamp: update.timestamp,
									speed: navigationFix.speed
								});

								const previousTargetId = navigationTargetId;
								updateNavigationPanel(true);
								if (liveRouteActive && navigationTargetId !== previousTargetId) refreshLiveRoute();
								tryStartAutomaticLive();

								const markerHtml = hasCourse
								? `<svg viewBox="0 0 24 24" width="26" height="26" style="transform:rotate(${heading}deg)" aria-label="Rumbo GPS"><path d="M12 2 L21 21 L12 17 L3 21 Z" fill="#087bd1" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg>`
								: '<span></span>';

								gpsPositionMarker.setLatLng([latitude, longitude]);

								gpsPositionMarker.setIcon(L.divIcon({
									className: 'route-builder-gps-position-icon',
									html: markerHtml,
									iconSize: [26, 26],
									iconAnchor: [13, 13]
								}));

								if (followBoat) centerBoatInVisibleMap();
							},
							() => {
								if (!navigationActive || requestGeneration !== gpsRequestGeneration) return;
								if (gpsPositionMarker) updateForecastStatus('No se pudo actualizar el seguimiento GPS.');
							},
							{
								enableHighAccuracy: true,
								timeout: 20000,
								maximumAge: 5000
							}
						);
					}
				} catch(_a) {
					if (requestGeneration === gpsRequestGeneration) updateForecastStatus('No se pudo obtener una posición GPS. Comprueba la ubicación y sus permisos.');
				} finally {
					if (requestGeneration === gpsRequestGeneration && gpsButton) {
						gpsButton.disabled = false;
						gpsButton.innerHTML = navigationButtonIcon;
					}
				}
			}));

			forecastDrawer.appendChild(gpsButton);
			forecastDrawer.appendChild(liveButton);
			forecastDrawer.appendChild(centerButton);
			forecastDrawer.appendChild(zoomInButton);
			forecastDrawer.appendChild(zoomOutButton);

			forecastDrawer.addEventListener(
				'toggle',
				event => {
					const details = event.target;
					const group = details.dataset.visualGroup;
					if (!group) return;
					if (group === 'wind') windIndicatorSettingsOpen = details.open; else if (group === 'wave') waveIndicatorSettingsOpen = details.open; else if (group === 'laylines') laylinesSettingsOpen = details.open; else if (group === 'rose') windRoseSettingsOpen = details.open; else return;

					try {
						localStorage.setItem(
							`route-builder-${group === 'wind'
						? 'wind'
						: group === 'wave'
							? 'wave'
							: group === 'laylines' ? 'layline' : 'wind-rose'}-settings-open`,
							String(details.open)
						);
					} catch(/* Keep the setting in memory. */ _a) {
						
					} /* Keep the setting in memory. */
				},
				true
			);

			forecastDrawer.addEventListener('scroll', positionForecastFieldPickers, true);
			let panelHeightDrag = null;

			forecastDrawer.addEventListener('pointerdown', event => {
				var _a;
				const target = event.target;
				if (!target.closest('.departure-timebar-callout') || event.pointerType === 'mouse' && event.button !== 0) return;
				event.preventDefault();
				event.stopPropagation();

				panelHeightDrag = {
					pointerId: event.pointerId,
					startY: event.clientY,
					startHeight: forecastDrawerMaxHeightPercent,
					viewportHeight: ((_a = window.visualViewport) === null || _a === void 0
					? void 0
					: _a.height) || window.innerHeight
				};

				forecastDrawer.setPointerCapture(event.pointerId);
				forecastDrawer.classList.add('is-panel-height-dragging');
			});

			forecastDrawer.addEventListener('pointermove', event => {
				if (!panelHeightDrag || event.pointerId !== panelHeightDrag.pointerId) return;
				event.preventDefault();
				forecastDrawerMaxHeightPercent = Math.max(0, Math.min(100, Math.round(panelHeightDrag.startHeight + (panelHeightDrag.startY - event.clientY) * 100 / panelHeightDrag.viewportHeight)));
				applyForecastDrawerHeightLimit();
				scheduleCenterForLayoutChange();

				const input = forecastDrawer === null || forecastDrawer === void 0
				? void 0
				: forecastDrawer.querySelector('[data-forecast-drawer-height]');

				const label = forecastDrawer === null || forecastDrawer === void 0
				? void 0
				: forecastDrawer.querySelector('[data-forecast-drawer-height-value]');

				if (input) input.value = String(forecastDrawerMaxHeightPercent);
				if (label) label.textContent = `${forecastDrawerMaxHeightPercent}%`;
			});

			const finishPanelHeightDrag = event => {
				if (!panelHeightDrag || event.pointerId !== panelHeightDrag.pointerId) return;
				panelHeightDrag = null;

				forecastDrawer === null || forecastDrawer === void 0
				? void 0
				: forecastDrawer.classList.remove('is-panel-height-dragging');

				scheduleCenterForLayoutChange();

				try {
					localStorage.setItem('route-builder-drawer-max-height-percent', String(forecastDrawerMaxHeightPercent));
				} catch(/* Keep the current session setting. */ _a) {
					
				} /* Keep the current session setting. */
			};

			forecastDrawer.addEventListener('pointerup', finishPanelHeightDrag);
			forecastDrawer.addEventListener('pointercancel', finishPanelHeightDrag);
			let timelineMouseDrag = null;

			forecastDrawer.addEventListener('pointerdown', event => {
				if (event.pointerType !== 'mouse' || event.button !== 0) return;
				const scroller = event.target.closest('.departure-timebar-scroll');
				if (!scroller) return;

				if (liveRouteActive) {
					event.preventDefault();
					return;
				}

				event.preventDefault();

				if (departureScrollCommitTimer !== null) {
					window.clearTimeout(departureScrollCommitTimer);
					departureScrollCommitTimer = null;
				}

				timelineMouseDrag = {
					scroller,
					pointerId: event.pointerId,
					startX: event.clientX,
					scrollLeft: scroller.scrollLeft
				};

				scroller.setPointerCapture(event.pointerId);
				scroller.classList.add('is-dragging');
			});

			forecastDrawer.addEventListener('pointermove', event => {
				if (!timelineMouseDrag || event.pointerId !== timelineMouseDrag.pointerId) return;
				timelineMouseDrag.scroller.scrollLeft = timelineMouseDrag.scrollLeft - (event.clientX - timelineMouseDrag.startX);
			});

			const finishTimelineMouseDrag = event => {
				if (!timelineMouseDrag || event.pointerId !== timelineMouseDrag.pointerId) return;
				const scroller = timelineMouseDrag.scroller;
				timelineMouseDrag = null;
				scroller.classList.remove('is-dragging');
				scroller.dispatchEvent(new Event('scroll'));
			};

			forecastDrawer.addEventListener('pointerup', finishTimelineMouseDrag);
			forecastDrawer.addEventListener('pointercancel', finishTimelineMouseDrag);

			forecastDrawer.addEventListener(
				'scroll',
				event => {
					const target = event.target;

					if (target.matches('.departure-timebar-scroll')) {
						const programmaticScroll = Number(target.dataset.programmaticScroll);

						if (Number.isFinite(programmaticScroll) && Math.abs(target.scrollLeft - programmaticScroll) < 1) {
							delete target.dataset.programmaticScroll;
							return;
						}

						delete target.dataset.programmaticScroll;
						if (liveRouteActive) return;
						departureTimelineScrollLeft = target.scrollLeft;
						const departureTimestamp = departureTimestampAtTimelineCenter(target);
						if (departureTimestamp === null) return;
						updateQuickDepartureFields(snapDepartureTimestamp(departureTimestamp, Number(target.dataset.minDeparture), Number(target.dataset.maxDeparture)));
						if (departureScrollCommitTimer !== null) window.clearTimeout(departureScrollCommitTimer);

						departureScrollCommitTimer = window.setTimeout(
							() => {
								if (liveRouteActive) {
									departureScrollCommitTimer = null;
									return;
								}

								if ((timelineMouseDrag === null || timelineMouseDrag === void 0
								? void 0
								: timelineMouseDrag.scroller) === target) {
									departureScrollCommitTimer = null;
									return;
								}

								const settledTimestamp = departureTimestampAtTimelineCenter(target);

								if (settledTimestamp !== null) {
									const minDeparture = Number(target.dataset.minDeparture);
									const maxDeparture = Number(target.dataset.maxDeparture);
									const snappedTimestamp = snapDepartureTimestamp(settledTimestamp, minDeparture, maxDeparture);
									const timelineStart = Number(target.dataset.timelineStart);
									const pixelsPerHour = Number(target.dataset.pixelsPerHour);
									const leftPad = Number(target.dataset.timebarLeftPad);
									const desiredScroll = leftPad + (snappedTimestamp - timelineStart) / 3600000 * pixelsPerHour - target.clientWidth / 2;
									const minScroll = Math.max(0, leftPad + (minDeparture - timelineStart) / 3600000 * pixelsPerHour - target.clientWidth / 2);
									const maxScroll = Math.max(minScroll, leftPad + (maxDeparture - timelineStart) / 3600000 * pixelsPerHour - target.clientWidth / 2);
									const snappedScroll = Math.max(minScroll, Math.min(maxScroll, desiredScroll));
									if (Math.abs(snappedScroll - target.scrollLeft) > 0.1) target.scrollLeft = snappedScroll;
									if (toLocalDateTimeInput(new Date(snappedTimestamp)) !== departureDateTime) selectDepartureTime(snappedTimestamp);
								}

								departureScrollCommitTimer = null;
							},
							1000
						);
					}
				},
				true
			);

			forecastDrawer.addEventListener('pointerdown', event => {
				var _a;
				const handle = event.target.closest('[data-resize-column]');

				const table = handle === null || handle === void 0
				? void 0
				: handle.closest('.forecast-table');

				if (!handle || !table || Number(handle.dataset.resizeColumn) !== 0) return;
				const index = Number(handle.dataset.resizeColumn);
				const column = table.querySelector(`colgroup col[data-forecast-col="${index}"]`);
				if (!column) return;
				event.preventDefault();

				forecastColumnResize = {
					table,
					index,
					startX: event.clientX,
					startWidth: Number.parseFloat(column.style.width) || column.getBoundingClientRect().width
				};

				(_a = handle.setPointerCapture) === null || _a === void 0
				? void 0
				: _a.call(handle, event.pointerId);

				document.body.classList.add('forecast-column-resizing');
			});

			forecastDrawer.addEventListener('pointerdown', event => {
				var _a, _b;
				const pointerEvent = event;
				const labelHandle = pointerEvent.target.closest('.label-sort-handle');

				if (labelHandle) {
					const row = labelHandle.closest('.label-field-row');

					const field = row === null || row === void 0
					? void 0
					: row.dataset.labelField;

					const group = row === null || row === void 0
					? void 0
					: row.dataset.labelGroup;

					if (!field || !group) return;
					pointerEvent.preventDefault();

					pointerLabelDrag = {
						field,
						group,
						pointerId: pointerEvent.pointerId,
						handle: labelHandle
					};

					row.classList.add('is-label-dragging');

					(_a = labelHandle.setPointerCapture) === null || _a === void 0
					? void 0
					: _a.call(labelHandle, pointerEvent.pointerId);

					return;
				}

				if (pointerEvent.pointerType === 'mouse') return;
				const handle = pointerEvent.target.closest('.forecast-field-drag');

				const row = handle === null || handle === void 0
				? void 0
				: handle.closest('[data-route-field-row]');

				const field = row === null || row === void 0
				? void 0
				: row.dataset.routeFieldRow;

				if (!handle || !row || !field) return;
				pointerEvent.preventDefault();

				pointerFieldDrag = {
					field,
					pointerId: pointerEvent.pointerId,
					handle
				};

				draggedRouteField = field;
				row.classList.add('is-dragging');

				(_b = handle.setPointerCapture) === null || _b === void 0
				? void 0
				: _b.call(handle, pointerEvent.pointerId);
			});

			window.addEventListener('pointermove', event => {
				var _a, _b;

				if (pointerLabelDrag && event.pointerId === pointerLabelDrag.pointerId) {
					forecastDrawer === null || forecastDrawer === void 0
					? void 0
					: forecastDrawer.querySelectorAll('.label-field-row.is-drop-target').forEach(row => row.classList.remove('is-drop-target'));

					const targetRow = (_a = document.elementFromPoint(event.clientX, event.clientY)) === null || _a === void 0
					? void 0
					: _a.closest('.label-field-row');

					if ((targetRow === null || targetRow === void 0
					? void 0
					: targetRow.dataset.labelGroup) === pointerLabelDrag.group && targetRow.dataset.labelField !== pointerLabelDrag.field) targetRow.classList.add('is-drop-target');

					event.preventDefault();
					return;
				}

				if (pointerFieldDrag && event.pointerId === pointerFieldDrag.pointerId) {
					const rowSelector = '[data-route-field-row]';

					forecastDrawer === null || forecastDrawer === void 0
					? void 0
					: forecastDrawer.querySelectorAll('.is-drop-target').forEach(row => row.classList.remove('is-drop-target'));

					const target = (_b = document.elementFromPoint(event.clientX, event.clientY)) === null || _b === void 0
					? void 0
					: _b.closest(rowSelector);

					if (target && target !== pointerFieldDrag.handle.closest(rowSelector)) target.classList.add('is-drop-target');
					event.preventDefault();
					return;
				}

				if (!forecastColumnResize) return;
				const { table, index, startX, startWidth } = forecastColumnResize;
				const isRtl = getComputedStyle(table).direction === 'rtl';
				const delta = (event.clientX - startX) * (isRtl ? -1 : 1);
				const isRouteSummary = index > 0 && index < 4;
				const width = Math.max(isRouteSummary ? 42 : 36, Math.min(420, startWidth + delta));
				setForecastColumnWidth(table, index, width);
				applyForecastColumnWidths();
			});

			const finishForecastColumnResize = () => {
				if (!forecastColumnResize) return;
				saveForecastColumnWidths(forecastColumnResize.table);
				forecastColumnResize = null;
				document.body.classList.remove('forecast-column-resizing');
			};

			window.addEventListener('pointerup', finishForecastColumnResize);
			window.addEventListener('pointercancel', finishForecastColumnResize);

			window.addEventListener('pointerup', event => {
				var _a, _b;
				const labelDrag = pointerLabelDrag;

				if (labelDrag && event.pointerId === labelDrag.pointerId) {
					const hit = document.elementFromPoint(event.clientX, event.clientY);

					const targetRow = (hit === null || hit === void 0
					? void 0
					: hit.closest('.label-field-row')) || null;

					const targetField = targetRow === null || targetRow === void 0
					? void 0
					: targetRow.dataset.labelField;

					targetRow === null || targetRow === void 0
					? void 0
					: targetRow.classList.remove('is-drop-target');

					(_a = labelDrag.handle.closest('.label-field-row')) === null || _a === void 0
					? void 0
					: _a.classList.remove('is-label-dragging');

					forecastDrawer === null || forecastDrawer === void 0
					? void 0
					: forecastDrawer.querySelectorAll('.label-field-row.is-drop-target').forEach(row => row.classList.remove('is-drop-target'));

					pointerLabelDrag = null;
					if (!targetRow || targetRow.dataset.labelGroup !== labelDrag.group || !targetField || targetField === labelDrag.field) return;

					const order = labelDrag.group === 'waypoint'
					? [...waypointFieldOrder]
					: [...segmentFieldOrder];

					const oldIndex = order.indexOf(labelDrag.field);
					const targetIndex = order.indexOf(targetField);
					if (oldIndex < 0 || targetIndex < 0) return;
					order.splice(oldIndex, 1);
					let insertAt = order.indexOf(targetField);
					if (event.clientY > targetRow.getBoundingClientRect().top + targetRow.getBoundingClientRect().height / 2) insertAt += 1;
					order.splice(insertAt, 0, labelDrag.field);
					if (labelDrag.group === 'waypoint') $$invalidate(33, waypointFieldOrder = order); else $$invalidate(34, segmentFieldOrder = order);
					applyLabelSettings();
					return;
				}

				const drag = pointerFieldDrag;
				if (!drag || event.pointerId !== drag.pointerId) return;
				const rowSelector = '[data-route-field-row]';

				const targetRow = (_b = document.elementFromPoint(event.clientX, event.clientY)) === null || _b === void 0
				? void 0
				: _b.closest(rowSelector);

				const target = targetRow === null || targetRow === void 0
				? void 0
				: targetRow.dataset.routeFieldRow;

				const insertAfter = !!targetRow && event.clientY > targetRow.getBoundingClientRect().top + targetRow.getBoundingClientRect().height / 2;

				forecastDrawer === null || forecastDrawer === void 0
				? void 0
				: forecastDrawer.querySelectorAll('.is-dragging, .is-drop-target').forEach(row => row.classList.remove('is-dragging', 'is-drop-target'));

				pointerFieldDrag = null;
				draggedRouteField = null;
				if (target) reorderForecastField(drag.field, target, insertAfter);
			});

			window.addEventListener('pointercancel', event => {
				var _a;

				if (pointerLabelDrag && event.pointerId === pointerLabelDrag.pointerId) {
					(_a = pointerLabelDrag.handle.closest('.label-field-row')) === null || _a === void 0
					? void 0
					: _a.classList.remove('is-label-dragging');

					pointerLabelDrag = null;

					forecastDrawer === null || forecastDrawer === void 0
					? void 0
					: forecastDrawer.querySelectorAll('.label-field-row.is-drop-target').forEach(row => row.classList.remove('is-drop-target'));
				}

				if (!pointerFieldDrag || event.pointerId !== pointerFieldDrag.pointerId) return;

				forecastDrawer === null || forecastDrawer === void 0
				? void 0
				: forecastDrawer.querySelectorAll('.is-dragging, .is-drop-target').forEach(row => row.classList.remove('is-dragging', 'is-drop-target'));

				pointerFieldDrag = null;
				draggedRouteField = null;
			});

			forecastDrawer.addEventListener('keydown', event => {
				const handle = event.target.closest('[data-resize-column]');

				const table = handle === null || handle === void 0
				? void 0
				: handle.closest('.forecast-table');

				if (!handle || !table || Number(handle.dataset.resizeColumn) !== 0 || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
				const keyEvent = event;
				keyEvent.preventDefault();
				const index = Number(handle.dataset.resizeColumn);
				const column = table.querySelector(`colgroup col[data-forecast-col="${index}"]`);
				if (!column) return;
				const direction = keyEvent.key === 'ArrowRight' ? 1 : -1;
				const amount = keyEvent.shiftKey ? 24 : 8;
				setForecastColumnWidth(table, index, (Number.parseFloat(column.style.width) || column.getBoundingClientRect().width) + direction * amount);
				applyForecastColumnWidths();
				saveForecastColumnWidths(table);
			});

			forecastDrawer.addEventListener('mousemove', event => {
				const target = event.target.closest('[data-forecast-index]');
				if (!target) return;
				const index = Number(target.dataset.forecastIndex);
				highlightRouteForecast(index);
				const sample = routeForecast[index];
				if (!sample) return;

				// Touch browsers synthesize mousemove events after taps. Changing
				// Windy's global forecast timestamp from those events forces a
				// full map redraw while a waypoint is selected or removed.
				if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

				const timestamp = sample.eta.getTime();
				if (hoveredForecastTimestamp === timestamp) return;

				if (hoverRestoreTimestamp === null) {
					const currentTimestamp = Number(windyStore.get('timestamp'));
					if (Number.isFinite(currentTimestamp)) hoverRestoreTimestamp = currentTimestamp;
				}

				if (windyStore.set('timestamp', timestamp)) hoveredForecastTimestamp = timestamp;
			});

			forecastDrawer.addEventListener('mouseleave', hideRouteForecastHighlight);
			let tableMouseDrag = null;

			forecastDrawer.addEventListener('pointerdown', event => {
				if (event.pointerType !== 'mouse' || event.button !== 0) return;
				const target = event.target;
				if (!target.closest('td[data-forecast-index]') || target.closest('button, a, input, select, textarea, [data-resize-column]')) return;
				const scroller = target.closest('.forecast-table-scroll');
				if (!scroller) return;
				event.preventDefault();

				tableMouseDrag = {
					scroller,
					pointerId: event.pointerId,
					startX: event.clientX,
					scrollLeft: scroller.scrollLeft
				};

				scroller.setPointerCapture(event.pointerId);
				scroller.classList.add('is-table-dragging');
			});

			forecastDrawer.addEventListener('pointermove', event => {
				if (!tableMouseDrag || event.pointerId !== tableMouseDrag.pointerId) return;
				tableMouseDrag.scroller.scrollLeft = tableMouseDrag.scrollLeft - (event.clientX - tableMouseDrag.startX);
			});

			const finishTableMouseDrag = event => {
				if (!tableMouseDrag || event.pointerId !== tableMouseDrag.pointerId) return;
				tableMouseDrag.scroller.classList.remove('is-table-dragging');
				tableMouseDrag = null;
			};

			forecastDrawer.addEventListener('pointerup', finishTableMouseDrag);
			forecastDrawer.addEventListener('pointercancel', finishTableMouseDrag);

			forecastDrawer.addEventListener('dragstart', event => {
				var _a;
				const row = event.target.closest('[data-route-field-row]');

				const field = row === null || row === void 0
				? void 0
				: row.dataset.routeFieldRow;

				if (!row || !field) return;
				draggedRouteField = field;

				(_a = event.dataTransfer) === null || _a === void 0
				? void 0
				: _a.setData('text/plain', field);

				if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
				row.classList.add('is-dragging');
			});

			forecastDrawer.addEventListener('dragover', event => {
				if (event.target.closest('[data-route-field-row]')) event.preventDefault();
			});

			forecastDrawer.addEventListener('drop', event => {
				var _a;
				const targetRow = event.target.closest('[data-route-field-row]');

				const source = draggedRouteField || ((_a = event.dataTransfer) === null || _a === void 0
				? void 0
				: _a.getData('text/plain'));

				const target = targetRow === null || targetRow === void 0
				? void 0
				: targetRow.dataset.routeFieldRow;

				if (!targetRow || !source || !target || source === target) return;
				event.preventDefault();
				const order = routeFieldOrder.filter(key => key !== source);
				const targetIndex = order.indexOf(target);
				if (targetIndex < 0) return;
				const insertAfter = event.clientY > targetRow.getBoundingClientRect().top + targetRow.getBoundingClientRect().height / 2;
				order.splice(targetIndex + (insertAfter ? 1 : 0), 0, source);
				routeFieldOrder = order;
				saveRouteFieldLayout();
				draggedRouteField = null;
				renderForecastDrawer();
			});

			forecastDrawer.addEventListener('dragend', event => {
				var _a;

				(_a = event.target.closest('[data-route-field-row]')) === null || _a === void 0
				? void 0
				: _a.classList.remove('is-dragging');

				draggedRouteField = null;
			});

			let routeSnapshotPress = null;
			let suppressedRouteSnapshotClick = null;

			const cancelRouteSnapshotPress = pointerId => {
				if (!routeSnapshotPress || routeSnapshotPress.pointerId !== pointerId) return;
				window.clearTimeout(routeSnapshotPress.timer);
				routeSnapshotPress = null;
			};

			forecastDrawer.addEventListener('pointerdown', event => {
				if (event.pointerType === 'mouse' && event.button !== 0 || !event.isPrimary || routeSnapshotPress) return;
				const button = event.target.closest('[data-route-save-load]');

				const slot = Number(button === null || button === void 0
				? void 0
				: button.dataset.routeSaveLoad);

				if (!button || !Number.isInteger(slot) || slot < 0 || slot >= routeSnapshotKeys.length || routeSnapshotActions[slot] !== 'load') return;

				try {
					button.setPointerCapture(event.pointerId);
				} catch(/* Continue without pointer capture when the browser does not support it. */ _a) {
					
				} /* Continue without pointer capture when the browser does not support it. */

				const press = {
					slot,
					pointerId: event.pointerId,
					startX: event.clientX,
					startY: event.clientY,
					timer: 0
				};

				press.timer = window.setTimeout(
					() => {
						if (routeSnapshotPress !== press) return;

						if (!button.isConnected) {
							routeSnapshotPress = null;
							return;
						}

						routeSnapshotPress = null;
						suppressedRouteSnapshotClick = { slot, expiresAt: Date.now() + 750 };

						if (!points.length) {
							try {
								localStorage.removeItem(routeSnapshotKeys[slot]);
								routeSnapshotActions[slot] = 'save';
								$$invalidate(2, forecastMessage = `Ruta ${slot + 1} eliminada del espacio guardado.`);
							} catch(_a) {
								$$invalidate(2, forecastMessage = 'No se pudo borrar la ruta del almacenamiento del navegador.');
							}

							renderForecastDrawer();
							return;
						}

						saveRouteSnapshot(slot);
					},
					650
				);

				routeSnapshotPress = press;
			});

			forecastDrawer.addEventListener('pointermove', event => {
				if (!routeSnapshotPress || event.pointerId !== routeSnapshotPress.pointerId) return;
				if (Math.hypot(event.clientX - routeSnapshotPress.startX, event.clientY - routeSnapshotPress.startY) > 12) cancelRouteSnapshotPress(event.pointerId);
			});

			forecastDrawer.addEventListener('pointerup', event => cancelRouteSnapshotPress(event.pointerId));
			forecastDrawer.addEventListener('pointercancel', event => cancelRouteSnapshotPress(event.pointerId));

			forecastDrawer.addEventListener('contextmenu', event => {
				if (event.target.closest('[data-route-save-load]')) event.preventDefault();
			});

			forecastDrawer.addEventListener('click', event => {
				var _a;
				const target = event.target;
				const groupToggle = target.closest('[data-group-toggle]');

				if (groupToggle) {
					const key = groupToggle.dataset.groupToggle;
					collapsedGroups[key] = collapsedGroups[key] === false;

					try {
						localStorage.setItem('route-builder-model-groups-collapsed', JSON.stringify(collapsedGroups));
					} catch(_b) {
						
					}

					renderForecastDrawer();
					return;
				}

				if (target.closest('[data-wind-models-toggle]')) {
					windModelRowsCollapsed = !windModelRowsCollapsed;

					try {
						localStorage.setItem('route-builder-wind-model-rows-collapsed', String(windModelRowsCollapsed));
					} catch(/* Keep the current display state. */ _c) {
						
					} /* Keep the current display state. */

					renderForecastDrawer();
					return;
				}

				if (target.closest('.forecast-drawer-close')) {
					closeNavigatorPlugin();
					return;
				}

				if (target.matches('.forecast-settings-backdrop') || target.closest('[data-weather-settings-dismiss]')) {
					showWeatherSettingsMenu = false;
					renderForecastDrawer();
					return;
				}

				if (showWeatherSettingsMenu && !target.closest('.forecast-weather-settings-menu')) {
					showWeatherSettingsMenu = false;

					const backdrop = forecastDrawer === null || forecastDrawer === void 0
					? void 0
					: forecastDrawer.querySelector('.forecast-settings-backdrop');

					const toggle = forecastDrawer === null || forecastDrawer === void 0
					? void 0
					: forecastDrawer.querySelector('[data-weather-settings-toggle]');

					if (backdrop) backdrop.hidden = true;

					toggle === null || toggle === void 0
					? void 0
					: toggle.setAttribute('aria-expanded', 'false');
				}

				if (target.closest('[data-weather-settings-toggle]')) {
					showWeatherSettingsMenu = !showWeatherSettingsMenu;
					renderForecastDrawer();
					return;
				}

				const settingsTabButton = target.closest('[data-settings-tab]');

				if (settingsTabButton) {
					settingsTab = settingsTabButton.dataset.settingsTab === 'map'
					? 'map'
					: settingsTabButton.dataset.settingsTab === 'navigation'
						? 'navigation'
						: 'forecast';

					renderForecastDrawer();
					return;
				}

				if (target.closest('[data-route-clear]')) {
					clearRoute();
					return;
				}

				const routeSlotButton = target.closest('[data-route-save-load]');

				if (routeSlotButton) {
					const slot = Number(routeSlotButton.dataset.routeSaveLoad);
					if (!Number.isInteger(slot) || slot < 0 || slot >= routeSnapshotKeys.length) return;

					if (suppressedRouteSnapshotClick && suppressedRouteSnapshotClick.expiresAt >= Date.now() && suppressedRouteSnapshotClick.slot === slot) {
						suppressedRouteSnapshotClick = null;
						event.preventDefault();
						return;
					}

					if (suppressedRouteSnapshotClick && suppressedRouteSnapshotClick.expiresAt < Date.now()) suppressedRouteSnapshotClick = null;
					if (routeSnapshotActions[slot] === 'save') saveRouteSnapshot(slot); else loadRouteSnapshot(slot);
					return;
				}

				if (target.closest('[data-route-field-add-toggle]')) {
					showRouteFieldPicker = !showRouteFieldPicker;
					selectedRouteFields.clear();
					renderForecastDrawer();
					return;
				}

				if (target.closest('[data-route-field-commit]')) {
					if (!selectedRouteFields.size) return;
					hiddenRouteFields = new Set(hiddenRouteFields);
					selectedRouteFields.forEach(field => hiddenRouteFields.delete(field));
					selectedRouteFields.clear();
					showRouteFieldPicker = false;
					saveRouteFieldLayout();
					departureEligibilityDirty = true;
					renderForecastDrawer();
					void calculateDepartureEligibility();
					return;
				}

				const addRouteGroup = target.closest('[data-route-field-add-group]');

				if (addRouteGroup) {
					const key = addRouteGroup.dataset.routeFieldAddGroup;
					const fields = pickerGroupAvailableFields(key);
					if (!fields.length) return;
					const allSelected = fields.every(field => selectedRouteFields.has(field));

					fields.forEach(field => allSelected
					? selectedRouteFields.delete(field)
					: selectedRouteFields.add(field));

					refreshRoutePickerSelection();
					return;
				}

				const addRouteField = target.closest('[data-route-field-add]');

				if (addRouteField) {
					const field = addRouteField.dataset.routeFieldAdd;
					if (!hiddenRouteFields.has(field)) return;
					if (selectedRouteFields.has(field)) selectedRouteFields.delete(field); else selectedRouteFields.add(field);
					refreshRoutePickerSelection();
					return;
				}

				const arrivalHourButton = target.closest('[data-arrival-hour]');
				const arrivalDayButton = target.closest('[data-arrival-day]');
				const arrivalPresetButton = target.closest('[data-arrival-day-preset]');

				if ((arrivalHourButton || arrivalDayButton || arrivalPresetButton) && activeWindowCondition === 'arrival') {
					if (arrivalPresetButton) arrivalHours = Array.from({ length: 12 }, (_, index) => index + 6); else if (arrivalHourButton) {
						const hour = Number(arrivalHourButton.dataset.arrivalHour);
						if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;

						arrivalHours = arrivalHours.includes(hour)
						? arrivalHours.filter(value => value !== hour)
						: [...arrivalHours, hour];
					} else if (arrivalDayButton) {
						const day = Number(arrivalDayButton.dataset.arrivalDay);
						if (!Number.isInteger(day) || day < 0 || day > 6) return;

						arrivalDays = arrivalDays.includes(day)
						? arrivalDays.filter(value => value !== day)
						: [...arrivalDays, day];
					}

					saveWindowConstraints();
					windowConditionsDirty = true;
					departureEligibilityDirty = true;
					renderForecastDrawer();
					void calculateDepartureEligibility();
					return;
				}

				const sectorButton = target.closest('[data-direction-sector]');
				const allDirectionsButton = target.closest('[data-direction-all]');

				if ((sectorButton || allDirectionsButton) && activeWindowCondition && hasDirectionWheel(activeWindowCondition)) {
					const key = activeWindowCondition;

					if (allDirectionsButton) directionSelections[key] = directionNames.map((_, index) => index); else {
						const sector = Number(sectorButton.dataset.directionSector);
						if (!Number.isInteger(sector) || sector < 0 || sector > 7) return;
						const selected = selectedDirections(key);

						directionSelections[key] = selected.includes(sector)
						? selected.filter(value => value !== sector)
						: [...selected, sector];
					}

					saveWindowConstraints();
					windowConditionsDirty = true;
					departureEligibilityDirty = true;
					renderForecastDrawer();
					void calculateDepartureEligibility();
					return;
				}

				const removeRouteField = target.closest('[data-route-field-remove]');

				if (removeRouteField) {
					const key = removeRouteField.dataset.routeFieldRemove;
					hiddenRouteFields = new Set(hiddenRouteFields);

					const fieldsToRemove = key === 'windAverage'
					? windModelFieldKeys
					: additionalGroups[key]
						? additionalGroups[key].fields
						: [key];

					fieldsToRemove.forEach(field => {
						if (field === 'arrival') {
							arrivalHours = [];
							arrivalDays = [];
						}

						delete directionSelections[field];
						if (field !== 'windAverage') hiddenRouteFields.add(field);

						if (isSkyField(field)) windowConstraints[field].states = []; else {
							windowConstraints[field].min = '';
							windowConstraints[field].max = '';
						}
					});

					delete directionSelections[key];

					if (key === 'skyAverage') windowConstraints.skyAverage.states = []; else if (additionalGroups[key]) {
						windowConstraints[key].min = '';
						windowConstraints[key].max = '';
					}

					if (key === 'windAverage') {
						windowConstraints.windAverage.min = '';
						windowConstraints.windAverage.max = '';
					}

					saveWindowConstraints();
					windowConditionsDirty = true;
					departureEligibilityDirty = true;
					showRouteFieldPicker = false;
					saveRouteFieldLayout();
					renderForecastDrawer();
					windowConditionsDirty = false;
					void calculateDepartureEligibility();
					return;
				}

				const clearConditionButton = target.closest('[data-window-condition-clear]');

				if (clearConditionButton) {
					const key = clearConditionButton.dataset.windowConditionClear;
					delete directionSelections[key];

					if (key === 'arrival') {
						arrivalHours = [];
						arrivalDays = [];
					}

					if (isSkyField(key)) windowConstraints[key].states = [];

					if (!isSkyField(key)) {
						windowConstraints[key].min = '';
						windowConstraints[key].max = '';
					}

					saveWindowConstraints();
					forecastDrawer.querySelectorAll('[data-condition-bound]').forEach(input => input.value = '');

					(_a = forecastDrawer.querySelector(`[data-window-condition="${key}"]`)) === null || _a === void 0
					? void 0
					: _a.classList.remove('is-configured');

					updateConditionButtonStatus(key);
					windowConditionsDirty = true;
					departureEligibilityDirty = true;
					activeWindowCondition = null;
					windowConditionsDirty = false;
					renderForecastDrawer();
					void calculateDepartureEligibility();
					return;
				}

				// The backdrop surrounds the whole dialog, so only dismiss when the
				// backdrop itself is clicked or an explicit dismiss button is used.
				if (target.matches('.window-condition-backdrop') || target.closest('button[data-window-condition-dismiss]')) {
					activeWindowCondition = null;
					renderForecastDrawer();

					if (windowConditionsDirty) {
						windowConditionsDirty = false;
						void calculateDepartureEligibility();
					}

					return;
				}

				const conditionButton = target.closest('[data-window-condition]');

				if (conditionButton) {
					activeWindowCondition = conditionButton.dataset.windowCondition;
					renderForecastDrawer();
					return;
				}
			});

			forecastDrawer.addEventListener('input', event => {
				const target = event.target;
				const drawerHeightInput = target.closest('[data-forecast-drawer-height]');

				if (drawerHeightInput) {
					forecastDrawerMaxHeightPercent = Number(drawerHeightInput.value);
					applyForecastDrawerHeightLimit();
					scheduleCenterForLayoutChange();

					const value = forecastDrawer === null || forecastDrawer === void 0
					? void 0
					: forecastDrawer.querySelector('[data-forecast-drawer-height-value]');

					if (value) value.textContent = `${forecastDrawerMaxHeightPercent}%`;
					return;
				}

				const conditionSlider = target.closest('[data-condition-slider]');

				if (conditionSlider) {
					updateConditionRangeSlider(conditionSlider);
					return;
				}
			});

			forecastDrawer.addEventListener('change', event => {
				const target = event.target;
				const windIndicatorSelect = target.closest('[data-wind-indicator-field]');

				if (windIndicatorSelect) {
					const field = windIndicatorSelect.value;

					windIndicatorField = field && windIndicatorOptions().includes(field)
					? field
					: '';

					windIndicatorUserChoice = true;

					try {
						localStorage.setItem('route-builder-wind-indicator-field', windIndicatorField);
					} catch(/* Keep current setting in memory. */ _a) {
						
					} /* Keep current setting in memory. */

					redrawMapOverlays();
					return;
				}

				const waveIndicatorSelect = target.closest('[data-wave-indicator-field]');

				if (waveIndicatorSelect) {
					const field = waveIndicatorSelect.value;

					waveIndicatorField = field && waveIndicatorOptions().includes(field)
					? field
					: '';

					waveIndicatorUserChoice = true;

					try {
						localStorage.setItem('route-builder-wave-indicator-field', waveIndicatorField);
					} catch(/* Keep current setting in memory. */ _b) {
						
					} /* Keep current setting in memory. */

					redrawMapOverlays();
					return;
				}

				const waveVisualInput = target.closest('[data-wave-indicator-setting]');

				if (waveVisualInput) {
					const value = Number(waveVisualInput.value);
					if (!Number.isFinite(value)) return;
					const setting = waveVisualInput.dataset.waveIndicatorSetting;
					if (setting === 'distance') waveIndicatorDistance = Math.max(20, Math.min(200, value)); else if (setting === 'size') waveIndicatorSize = Math.max(16, Math.min(80, value)); else if (setting === 'text-size') waveIndicatorTextSize = Math.max(6, Math.min(40, value)); else return;

					waveVisualInput.value = String(setting === 'distance'
					? waveIndicatorDistance
					: setting === 'size'
						? waveIndicatorSize
						: waveIndicatorTextSize);

					try {
						localStorage.setItem(`route-builder-wave-indicator-${setting}`, waveVisualInput.value);
					} catch(/* Keep current setting in memory. */ _c) {
						
					} /* Keep current setting in memory. */

					redrawMapOverlays();
					return;
				}

				const waveDegreesToggle = target.closest('[data-wave-indicator-degrees]');

				if (waveDegreesToggle) {
					waveIndicatorDegreesEnabled = waveDegreesToggle.checked;

					try {
						localStorage.setItem('route-builder-wave-indicator-degrees', String(waveIndicatorDegreesEnabled));
					} catch(/* Keep the setting in memory. */ _d) {
						
					} /* Keep the setting in memory. */

					redrawWaveIndicator();
					return;
				}

				const windVisualInput = target.closest('[data-wind-indicator-setting]');

				if (windVisualInput) {
					const value = Number(windVisualInput.value);
					if (!Number.isFinite(value)) return;
					const setting = windVisualInput.dataset.windIndicatorSetting;
					if (setting === 'distance') windIndicatorDistance = Math.max(20, Math.min(200, value)); else if (setting === 'size') windIndicatorSize = Math.max(16, Math.min(80, value)); else if (setting === 'text-size') windIndicatorTextSize = Math.max(6, Math.min(40, value)); else return;

					windVisualInput.value = String(setting === 'distance'
					? windIndicatorDistance
					: setting === 'size'
						? windIndicatorSize
						: windIndicatorTextSize);

					try {
						localStorage.setItem(`route-builder-wind-indicator-${setting}`, windVisualInput.value);
					} catch(/* Keep current setting in memory. */ _e) {
						
					} /* Keep current setting in memory. */

					redrawMapOverlays();
					return;
				}

				const windDegreesToggle = target.closest('[data-wind-indicator-degrees]');

				if (windDegreesToggle) {
					windIndicatorDegreesEnabled = windDegreesToggle.checked;

					try {
						localStorage.setItem('route-builder-wind-indicator-degrees', String(windIndicatorDegreesEnabled));
					} catch(/* Keep the setting in memory. */ _f) {
						
					} /* Keep the setting in memory. */

					redrawWindIndicator();
					return;
				}

				const windRoseToggle = target.closest('[data-wind-rose-enabled]');

				if (windRoseToggle) {
					windRoseEnabled = windRoseToggle.checked;

					try {
						localStorage.setItem('route-builder-wind-rose-enabled', String(windRoseEnabled));
					} catch(/* Keep the setting in memory. */ _g) {
						
					} /* Keep the setting in memory. */

					redrawWindRose();
					return;
				}

				const headingDegreesToggle = target.closest('[data-heading-degrees-enabled]');

				if (headingDegreesToggle) {
					headingDegreesEnabled = headingDegreesToggle.checked;

					try {
						localStorage.setItem('route-builder-heading-degrees-enabled', String(headingDegreesEnabled));
					} catch(/* Keep the setting in memory. */ _h) {
						
					} /* Keep the setting in memory. */

					redrawWindRose();
					return;
				}

				const headingDegreesInput = target.closest('[data-heading-degrees-setting]');

				if (headingDegreesInput) {
					const value = Number(headingDegreesInput.value);
					if (!Number.isFinite(value)) return;
					const setting = headingDegreesInput.dataset.headingDegreesSetting;
					if (setting === 'font-size') headingDegreesFontSize = Math.max(6, Math.min(40, value)); else if (setting === 'width') headingDegreesWidth = Math.max(30, Math.min(200, value)); else if (setting === 'height') headingDegreesHeight = Math.max(16, Math.min(100, value)); else return;

					const actual = setting === 'font-size'
					? headingDegreesFontSize
					: setting === 'width'
						? headingDegreesWidth
						: headingDegreesHeight;

					headingDegreesInput.value = String(actual);

					try {
						localStorage.setItem(`route-builder-heading-degrees-${setting}`, String(actual));
					} catch(/* Keep the setting in memory. */ _j) {
						
					} /* Keep the setting in memory. */

					redrawWindRose();
					return;
				}

				const windRoseModeSelect = target.closest('[data-wind-rose-label-mode]');

				if (windRoseModeSelect) {
					windRoseLabelMode = windRoseModeSelect.value === 'degrees'
					? 'degrees'
					: 'cardinal';

					try {
						localStorage.setItem('route-builder-wind-rose-label-mode', windRoseLabelMode);
					} catch(/* Keep the setting in memory. */ _k) {
						
					} /* Keep the setting in memory. */

					redrawWindRose();
					return;
				}

				const windRoseInput = target.closest('[data-wind-rose-setting]');

				if (windRoseInput) {
					const value = Number(windRoseInput.value);
					if (!Number.isFinite(value)) return;
					const setting = windRoseInput.dataset.windRoseSetting;
					if (setting === 'radius') windRoseRadius = Math.max(20, Math.min(200, value)); else if (setting === 'width') windRoseLineWidth = Math.max(1, Math.min(20, value)); else if (setting === 'font-size') windRoseFontSize = Math.max(4, Math.min(24, value)); else if (setting === 'transparency') windRoseTransparency = Math.max(0, Math.min(100, value)); else return;

					const actual = setting === 'radius'
					? windRoseRadius
					: setting === 'width'
						? windRoseLineWidth
						: setting === 'font-size'
							? windRoseFontSize
							: windRoseTransparency;

					windRoseInput.value = String(actual);

					try {
						localStorage.setItem(`route-builder-wind-rose-${setting}`, String(actual));
					} catch(/* Keep the setting in memory. */ _l) {
						
					} /* Keep the setting in memory. */

					redrawWindRose();
					return;
				}

				const laylineModeSelect = target.closest('[data-layline-mode]');

				if (laylineModeSelect) {
					if (['none', 'upwind', 'downwind', 'both', 'automatic'].includes(laylineModeSelect.value)) laylineMode = laylineModeSelect.value;

					try {
						localStorage.setItem('route-builder-layline-mode', laylineMode);
					} catch(/* Keep the setting in memory. */ _m) {
						
					} /* Keep the setting in memory. */

					redrawLaylines();
					return;
				}

				const laylineSetting = target.closest('[data-layline-setting]');

				if (laylineSetting) {
					const setting = laylineSetting.dataset.laylineSetting;
					const value = Number(laylineSetting.value);
					if (!Number.isFinite(value)) return;
					if (setting === 'upwind-angle') upwindLaylineAngle = Math.max(0, Math.min(90, value)); else if (setting === 'downwind-angle') downwindLaylineAngle = Math.max(90, Math.min(180, value)); else return;

					laylineSetting.value = String(setting === 'upwind-angle'
					? upwindLaylineAngle
					: downwindLaylineAngle);

					try {
						localStorage.setItem(`route-builder-${setting}`, laylineSetting.value);
					} catch(/* Keep the setting in memory. */ _o) {
						
					} /* Keep the setting in memory. */

					redrawLaylines();
					return;
				}

				const laylineColorInput = target.closest('[data-layline-color]');

				if (laylineColorInput) {
					const setting = laylineColorInput.dataset.laylineColor;
					const color = laylineColorInput.value;
					if (!(/^#[\da-f]{6}$/i).test(color)) return;
					if (setting === 'port') portWindLaylineColor = color; else if (setting === 'starboard') starboardWindLaylineColor = color; else return;

					try {
						localStorage.setItem(`route-builder-layline-${setting}-color`, color);
					} catch(/* Keep the selected color for this session. */ _p) {
						
					} /* Keep the selected color for this session. */

					redrawLaylines();
					return;
				}

				const drawerHeightInput = target.closest('[data-forecast-drawer-height]');

				if (drawerHeightInput) {
					forecastDrawerMaxHeightPercent = Math.max(0, Math.min(100, Number(drawerHeightInput.value)));

					try {
						localStorage.setItem('route-builder-drawer-max-height-percent', String(forecastDrawerMaxHeightPercent));
					} catch(/* Keep the current session setting. */ _q) {
						
					} /* Keep the current session setting. */

					applyForecastDrawerHeightLimit();
					scheduleCenterForLayoutChange();
					return;
				}

				const speedInput = target.closest('[data-route-speed]');

				if (speedInput) {
					speedKnots = Number(speedInput.value);
					applyRouteSettings();
					return;
				}

				const liveSetting = target.closest('[data-live-setting]');

				if (liveSetting) {
					const value = Number(liveSetting.value);
					const name = liveSetting.dataset.liveSetting;
					if (name === 'speed' && liveSpeedOptions.includes(value)) liveSpeedSeconds = value; else if (name === 'forecast' && liveForecastOptions.includes(value)) liveForecastSeconds = value; else if (name === 'waypoints' && liveWaypointOptions.includes(value)) liveWaypointSeconds = value; else return;

					try {
						localStorage.setItem('route-builder-live-speed-seconds', String(liveSpeedSeconds));
						localStorage.setItem('route-builder-live-forecast-seconds', String(liveForecastSeconds));
						localStorage.setItem('route-builder-live-waypoint-seconds', String(liveWaypointSeconds));
					} catch(/* Keep current settings in memory. */ _r) {
						
					} /* Keep current settings in memory. */

					restartLiveTimers();
					return;
				}

				const restorePreviousRouteToggle = target.closest('[data-nav-restore-previous-route]');

				if (restorePreviousRouteToggle) {
					restorePreviousRouteOnNavExit = restorePreviousRouteToggle.checked;

					try {
						localStorage.setItem('route-builder-restore-previous-route-on-nav-exit', String(restorePreviousRouteOnNavExit));
					} catch(/* Keep the setting for this session. */ _s) {
						
					} /* Keep the setting for this session. */

					return;
				}

				const weatherSetting = target.closest('[data-weather-setting]');

				if (weatherSetting) {
					const value = Number(weatherSetting.value);
					if (weatherSetting.dataset.weatherSetting === 'sample-interval') routeSampleIntervalHours = value; else if (weatherSetting.dataset.weatherSetting === 'search-days') weatherSearchDays = value; else if (weatherSetting.dataset.weatherSetting === 'departure-interval') departureIntervalHours = value;
					saveWeatherWindowSettings();
					departureEligibilityDirty = hasConfiguredWindowConditions();
					void calculateRouteForecast();
					return;
				}

				const conditionInput = target.closest('[data-condition-bound]');

				if (conditionInput && activeWindowCondition) {
					const bound = conditionInput.dataset.conditionBound;
					const conditionBounds = windowConstraints[activeWindowCondition];

					conditionBounds[bound] = conditionInput.value === ''
					? ''
					: conditionInput instanceof HTMLInputElement && ['number', 'range'].includes(conditionInput.type)
						? Number(conditionInput.value)
						: conditionInput.value;

					if (conditionInput instanceof HTMLInputElement && conditionInput.type === 'range') {
						const sliderControl = conditionInput.closest('.condition-slider-control');

						sliderControl === null || sliderControl === void 0
						? void 0
						: sliderControl.querySelectorAll('[data-condition-slider][data-condition-bound]').forEach(slider => {
								const sliderBound = slider.dataset.conditionBound;
								conditionBounds[sliderBound] = Number(slider.value);
							});
					}

					saveWindowConstraints();
					windowConditionsDirty = true;
					departureEligibilityDirty = true;
					updateConditionButtonStatus(activeWindowCondition);
					void calculateDepartureEligibility();
					return;
				}

				const skyStateToggle = target.closest('[data-sky-state]');

				if (skyStateToggle && activeWindowCondition && isSkyField(activeWindowCondition)) {
					const skyKey = activeWindowCondition;
					windowConstraints[skyKey].states = [...forecastDrawer.querySelectorAll('[data-sky-state]:checked')].map(input => input.dataset.skyState || '').filter(Boolean);
					saveWindowConstraints();
					windowConditionsDirty = true;
					departureEligibilityDirty = true;
					updateConditionButtonStatus(skyKey);
					void calculateDepartureEligibility();
					return;
				}
			});

			forecastReopenButton = document.createElement('button');
			forecastReopenButton.type = 'button';
			forecastReopenButton.className = 'route-builder-reopen-button';
			forecastReopenButton.textContent = 'Pronóstico de la ruta';
			forecastReopenButton.setAttribute('aria-label', 'Abrir pronóstico de la ruta');
			forecastReopenButton.hidden = true;

			forecastReopenButton.addEventListener('click', () => {
				if (forecastDrawer && !forecastDrawer.hidden && forecastDrawerMaxHeightPercent < 20) {
					forecastDrawerMaxHeightPercent = 50;

					try {
						localStorage.setItem('route-builder-drawer-max-height-percent', '50');
					} catch(/* Current session still uses the restored height. */ _a) {
						
					} /* Current session still uses the restored height. */

					applyForecastDrawerHeightLimit();
					renderForecastDrawer();
				} else void calculateRouteForecast();
			});

			document.body.appendChild(forecastReopenButton);
			applyForecastDrawerHeightLimit();
			document.body.classList.add('route-builder-fullscreen');
			activeWindowCondition = null;
			window.addEventListener('resize', positionForecastDrawer);
			window.addEventListener('resize', scheduleCenterForLayoutChange);
			map.on('resize', positionForecastDrawer);
			map.on('resize', redrawGpsCourseLine);
			map.on('move zoomend', redrawMapOverlays);
			map.on('dragstart', stopFollowingOnMapDrag);
			window.addEventListener('mousedown', onMapMouseDown, true);
			window.addEventListener('mousemove', onMapMouseMove, true);
			window.addEventListener('mouseup', onMapMouseUp, true);
			window.addEventListener('click', onMapDomClick, true);
			window.addEventListener('dblclick', onMapDomDoubleClick, true);
			if (points.length > 0) recalculate();
			forecastDrawer.classList.add('is-open');
			forecastDrawer.hidden = false;
			forecastReopenButton.hidden = true;

			requestAnimationFrame(() => {
				var _a;

				(_a = map.invalidateSize) === null || _a === void 0
				? void 0
				: _a.call(map);

				positionForecastDrawer();
			});

			if (points.length >= 2) void calculateRouteForecast(); else {
				$$invalidate(2, forecastMessage = 'Agrega al menos dos Waypoints para consultar el pronóstico.');
				renderForecastDrawer();
			}
		});

		function applyDistanceFont() {
			try {
				localStorage.setItem('route-builder-distance-font', distanceFont);
			} catch(/* Keep the current selection for this session. */ _a) {
				
			} /* Keep the current selection for this session. */

			redrawMap();
		}

		function applyDistanceUnit() {
			try {
				localStorage.setItem('route-builder-distance-unit', distanceUnit);
			} catch(/* Keep the current selection for this session. */ _a) {
				
			} /* Keep the current selection for this session. */

			redrawDistanceLabels();
		}

		function applyLabelSettings() {
			try {
				localStorage.setItem('route-builder-show-waypoint-date', String(showWaypointDate));
				localStorage.setItem('route-builder-show-waypoint-hour', String(showWaypointHour));
				waypointDatePosition = waypointFieldPositions['waypoint-date'];
				waypointHourPosition = waypointFieldPositions['waypoint-hour'];
				localStorage.setItem('route-builder-waypoint-date-position', waypointDatePosition);
				localStorage.setItem('route-builder-waypoint-hour-position', waypointHourPosition);
				for (const field of waypointLabelFields.slice(2)) localStorage.setItem(`route-builder-${field}-position`, waypointFieldPositions[field]);
				localStorage.setItem('route-builder-show-waypoint-distance-accumulated', String(showWaypointDistanceAccumulated));
				localStorage.setItem('route-builder-show-waypoint-time-accumulated', String(showWaypointTimeAccumulated));
				localStorage.setItem('route-builder-show-waypoint-distance-remaining', String(showWaypointDistanceRemaining));
				localStorage.setItem('route-builder-show-waypoint-time-remaining', String(showWaypointTimeRemaining));
				localStorage.setItem('route-builder-show-segment-time', String(showSegmentTime));
				localStorage.setItem('route-builder-show-segment-bearing', String(showSegmentBearing));
				localStorage.setItem('route-builder-show-segment-distance', String(showSegmentDistance));
				localStorage.setItem('route-builder-segment-time-position', segmentTimePosition);
				localStorage.setItem('route-builder-segment-bearing-position', segmentBearingPosition);
				localStorage.setItem('route-builder-segment-distance-position', segmentDistancePosition);
				localStorage.setItem('route-builder-waypoint-field-order', JSON.stringify(waypointFieldOrder));
				localStorage.setItem('route-builder-segment-field-order', JSON.stringify(segmentFieldOrder));
			} catch(/* Keep the current settings for this session. */ _a) {
				
			} /* Keep the current settings for this session. */

			redrawMap();
		}

		function saveWeatherWindowSettings() {
			try {
				localStorage.setItem('route-builder-sample-interval-hours', String(routeSampleIntervalHours));
				localStorage.setItem('route-builder-weather-search-days', String(weatherSearchDays));
				localStorage.setItem('route-builder-departure-interval-hours', String(departureIntervalHours));
			} catch(/* Keep the current settings for this session. */ _a) {
				
			} /* Keep the current settings for this session. */

			invalidateForecast();
		}

		function applyForecastDrawerHeightLimit() {
			if (!forecastDrawer) return;
			const rawHeight = Number(forecastDrawerMaxHeightPercent);

			const height = Number.isFinite(rawHeight)
			? Math.max(0, Math.min(100, rawHeight))
			: 50;

			forecastDrawer.classList.toggle('is-height-collapsed', height < 20);
			forecastDrawer.style.setProperty('--route-drawer-max-height-vh', `${height}vh`);
			forecastDrawer.style.setProperty('--route-drawer-max-height-dvh', `${height}dvh`);

			if (forecastReopenButton && !forecastDrawer.hidden) {
				forecastReopenButton.hidden = height >= 20;

				forecastReopenButton.textContent = height < 20
				? 'Restablecer panel'
				: 'Pronóstico de la ruta';

				forecastReopenButton.setAttribute('aria-label', height < 20
				? 'Restablecer panel'
				: 'Abrir pronóstico de la ruta');
			}
		}

		function renderRouteForecastSettingsControls(extraClass = '') {
			const option = (value, current, label) => `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`;
			return `<div class="route-forecast-settings${extraClass ? ` ${extraClass}` : ''}"><label>Intervalo de puntos<select data-weather-setting="sample-interval" aria-label="Intervalo temporal de los puntos de pronóstico">${[1, 3, 6, 12].map(value => option(value, routeSampleIntervalHours, `Cada ${value} h`)).join('')}</select></label><label>Ventana de búsqueda<select data-weather-setting="search-days" aria-label="Días de anticipación de búsqueda">${[3, 5, 7, 10, 15].map(value => option(value, weatherSearchDays, `${value} días`)).join('')}</select></label><label>Intervalo de salidas<select data-weather-setting="departure-interval" aria-label="Intervalo entre horas de salida">${[1, 2, 3, 6, 12, 24].map(value => option(value, departureIntervalHours, `Cada ${value} h`)).join('')}</select></label><label class="forecast-drawer-height-setting">Alto máximo del panel <span data-forecast-drawer-height-value>${forecastDrawerMaxHeightPercent}%</span><input type="range" min="0" max="100" step="1" value="${forecastDrawerMaxHeightPercent}" data-forecast-drawer-height aria-label="Alto máximo del panel en porcentaje de pantalla"></label></div>`;
		}

		function renderWeatherSettingsMenu() {
			var _a;
			const option = (value, current) => `<option value="${value}"${value === current ? ' selected' : ''}>${value >= 60 ? `${value / 60} min` : `${value} s`}</option>`;
			const windFields = windIndicatorOptions();

			if (!windIndicatorUserChoice) windIndicatorField = windFields.includes('directionAverage')
			? 'directionAverage'
			: '';

			if (windIndicatorField && !windFields.includes(windIndicatorField)) {
				windIndicatorField = '';

				try {
					localStorage.setItem('route-builder-wind-indicator-field', '');
				} catch(/* Keep current setting in memory. */ _b) {
					
				} /* Keep current setting in memory. */
			}

			const windOptions = windFields.map(field => `<option value="${field}"${field === windIndicatorField ? ' selected' : ''}>${field === 'directionAverage'
		? 'Promedio'
		: routeFieldPickerLabels[field]}</option>`).join('');

			const waveFields = waveIndicatorOptions();

			if (!waveIndicatorUserChoice) waveIndicatorField = waveFields.includes('wavesAverage')
			? 'wavesAverage'
			: waveFields.includes('swell1Average')
				? 'swell1Average'
				: (_a = waveFields[0]) !== null && _a !== void 0 ? _a : '';

			if (waveIndicatorField && !waveFields.includes(waveIndicatorField)) {
				waveIndicatorField = '';

				try {
					localStorage.setItem('route-builder-wave-indicator-field', '');
				} catch(/* Keep current setting in memory. */ _c) {
					
				} /* Keep current setting in memory. */
			}

			const waveOptions = waveFields.map(field => `<option value="${field}"${field === waveIndicatorField ? ' selected' : ''}>${field === 'wavesAverage' || field === 'swell1Average'
		? 'Promedio'
		: routeFieldPickerLabels[field]}</option>`).join('');

			const laylineModes = [
				['none', 'Ninguno'],
				['upwind', 'Solo Upwind'],
				['downwind', 'Solo Downwind'],
				['both', 'Ambos'],
				['automatic', 'Automático']
			];

			const windIndicatorSettings = `<details class="navigation-visual-group" data-visual-group="wind"${windIndicatorSettingsOpen ? ' open' : ''}><summary>Indicador de viento</summary><div class="navigation-visual-group-body"><label>Fuente<select data-wind-indicator-field aria-label="Fuente del indicador de viento"><option value="">Ninguno</option>${windOptions}</select></label><label class="wind-degrees-setting">Mostrar grados del viento<input type="checkbox" data-wind-indicator-degrees${windIndicatorDegreesEnabled ? ' checked' : ''}></label><label>Distancia al barco (px)<input type="number" min="20" max="200" step="1" value="${windIndicatorDistance}" data-wind-indicator-setting="distance"></label><label>Tamaño del indicador (px)<input type="number" min="16" max="80" step="1" value="${windIndicatorSize}" data-wind-indicator-setting="size"></label><label>Tamaño de la letra (px)<input type="number" min="6" max="40" step="1" value="${windIndicatorTextSize}" data-wind-indicator-setting="text-size"></label></div></details>`;
			const waveIndicatorSettings = `<details class="navigation-visual-group" data-visual-group="wave"${waveIndicatorSettingsOpen ? ' open' : ''}><summary>Indicador de olas</summary><div class="navigation-visual-group-body"><label>Fuente<select data-wave-indicator-field aria-label="Fuente del indicador de olas"><option value="">Ninguno</option>${waveOptions}</select></label><label>Mostrar grados de las olas<input type="checkbox" data-wave-indicator-degrees${waveIndicatorDegreesEnabled ? ' checked' : ''}></label><label>Distancia al barco (px)<input type="number" min="20" max="200" step="1" value="${waveIndicatorDistance}" data-wave-indicator-setting="distance"></label><label>Tamaño del indicador (px)<input type="number" min="16" max="80" step="1" value="${waveIndicatorSize}" data-wave-indicator-setting="size"></label><label>Tamaño de la letra (px)<input type="number" min="6" max="40" step="1" value="${waveIndicatorTextSize}" data-wave-indicator-setting="text-size"></label></div></details>`;
			const laylinesSettings = `<details class="navigation-visual-group" data-visual-group="laylines"${laylinesSettingsOpen ? ' open' : ''}><summary>Laylines</summary><div class="navigation-visual-group-body"><label>Modo<select data-layline-mode>${laylineModes.map(([value, label]) => `<option value="${value}"${value === laylineMode ? ' selected' : ''}>${label}</option>`).join('')}</select></label><label>Ángulo Upwind (0–90°)<input type="number" min="0" max="90" step="1" value="${upwindLaylineAngle}" data-layline-setting="upwind-angle"></label><label>Ángulo Downwind (90–180°)<input type="number" min="90" max="180" step="1" value="${downwindLaylineAngle}" data-layline-setting="downwind-angle"></label><label>Color babor del viento<input type="color" data-layline-color="port" value="${portWindLaylineColor}" aria-label="Color de las laylines por babor del viento"></label><label>Color estribor del viento<input type="color" data-layline-color="starboard" value="${starboardWindLaylineColor}" aria-label="Color de las laylines por estribor del viento"></label><small>Los ángulos se miden respecto a la dirección de donde viene el viento. Automático compara el viento seleccionado con el rumbo GPS del barco.</small></div></details>`;
			const windRoseSettings = `<details class="navigation-visual-group" data-visual-group="rose"${windRoseSettingsOpen ? ' open' : ''}><summary>Rosa de los vientos</summary><div class="navigation-visual-group-body"><label class="wind-rose-toggle">Mostrar rosa<input type="checkbox" data-wind-rose-enabled${windRoseEnabled ? ' checked' : ''}></label><label>Radio del círculo (px)<input type="number" min="20" max="200" step="1" value="${windRoseRadius}" data-wind-rose-setting="radius"></label><label>Ancho (px)<input type="number" min="1" max="20" step="1" value="${windRoseLineWidth}" data-wind-rose-setting="width" title="Grosor de las líneas de la rosa"></label><label>Tamaño de fuente (px)<input type="number" min="4" max="24" step="1" value="${windRoseFontSize}" data-wind-rose-setting="font-size"></label><label>Transparencia (%)<input type="number" min="0" max="100" step="1" value="${windRoseTransparency}" data-wind-rose-setting="transparency"></label><label>Etiquetas<select data-wind-rose-label-mode><option value="cardinal"${windRoseLabelMode === 'cardinal' ? ' selected' : ''}>Signos cardinales</option><option value="degrees"${windRoseLabelMode === 'degrees' ? ' selected' : ''}>Grados</option></select></label><hr><strong>Indicador de grados del heading</strong><label class="wind-rose-toggle">Mostrar grados<input type="checkbox" data-heading-degrees-enabled${headingDegreesEnabled ? ' checked' : ''}></label><label>Tamaño de letra (px)<input type="number" min="6" max="40" step="1" value="${headingDegreesFontSize}" data-heading-degrees-setting="font-size"></label><label>Ancho (px)<input type="number" min="30" max="200" step="1" value="${headingDegreesWidth}" data-heading-degrees-setting="width"></label><label>Alto (px)<input type="number" min="16" max="100" step="1" value="${headingDegreesHeight}" data-heading-degrees-setting="height"></label></div></details>`;
			const navigationSettings = `<div class="route-forecast-settings"><strong>En vivo</strong><label>Promedio de velocidad<select data-live-setting="speed">${liveSpeedOptions.map(value => option(value, liveSpeedSeconds)).join('')}</select></label><label>Actualizar pronóstico<select data-live-setting="forecast">${liveForecastOptions.map(value => option(value, liveForecastSeconds)).join('')}</select></label><label>Refrescar waypoints<select data-live-setting="waypoints">${liveWaypointOptions.map(value => option(value, liveWaypointSeconds)).join('')}</select></label><label class="nav-restore-route-setting">Cargar ruta anterior al salir del modo NAV<input type="checkbox" data-nav-restore-previous-route${restorePreviousRouteOnNavExit ? ' checked' : ''}></label><small>Apagado: conserva la ruta que estabas navegando.</small><details class="navigation-visual-aids"${visualAidsOpen ? ' open' : ''}><summary>Ayudas visuales</summary><div class="navigation-visual-aids-list">${windIndicatorSettings}${waveIndicatorSettings}${laylinesSettings}${windRoseSettings}</div></details></div>`;

			const settingsContent = settingsTab === 'forecast'
			? renderRouteForecastSettingsControls('route-forecast-settings')
			: settingsTab === 'navigation'
				? navigationSettings
				: '<div class="forecast-settings-map-tab"></div>';

			return `<div class="forecast-weather-settings-menu"><button type="button" class="forecast-settings-toggle" data-weather-settings-toggle aria-expanded="${showWeatherSettingsMenu}" aria-label="Ajustes, versión ${version}" title="Ajustes">⚙ Ajustes<small class="forecast-version">v${version}</small></button><div class="forecast-settings-backdrop"${showWeatherSettingsMenu ? '' : ' hidden'}><section class="forecast-settings-dialog" role="dialog" aria-modal="true" aria-label="Ajustes"><header><strong>Ajustes</strong><button type="button" data-weather-settings-dismiss aria-label="Cerrar ajustes">×</button></header><nav class="forecast-settings-tabs" aria-label="Secciones de ajustes"><button type="button" data-settings-tab="forecast" aria-pressed="${settingsTab === 'forecast'}">Pronóstico</button><button type="button" data-settings-tab="navigation" aria-pressed="${settingsTab === 'navigation'}">Navegación</button><button type="button" data-settings-tab="map" aria-pressed="${settingsTab === 'map'}">Datos en el mapa</button></nav>${settingsContent}</section></div></div>`;
		}

		function buildRouteForecastSamples(departureInput = departureDateTime) {
			if (points.length < 2) return [];

			const departure = departureInput instanceof Date
			? departureInput
			: new Date(departureInput);

			if (!Number.isFinite(departure.getTime())) return [];
			const cumulative = [0];
			for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + haversineNm(points[i - 1], points[i]));
			const totalDistance = cumulative[cumulative.length - 1];
			const speed = Math.max(0.1, speedKnots);
			const totalHours = totalDistance / speed;
			const intervalHours = Math.max(1, Number(routeSampleIntervalHours) || 3);
			const maxRegularIntervals = 119;
			const effectiveInterval = Math.max(intervalHours, totalHours / maxRegularIntervals);
			const intervalCount = Math.floor(totalHours / effectiveInterval + 1e-9);
			const distances = Array.from({ length: intervalCount + 1 }, (_, index) => Math.min(totalDistance, index * effectiveInterval * speed));
			if (distances[distances.length - 1] < totalDistance - 0.01) distances.push(totalDistance);

			return distances.map(distanceNm => {
				let segmentIndex = cumulative.findIndex((distance, index) => index > 0 && distance >= distanceNm);
				if (distanceNm <= 0) segmentIndex = 1;
				if (segmentIndex < 1) segmentIndex = points.length - 1;
				const startDistance = cumulative[segmentIndex - 1];
				const segmentDistance = Math.max(0.0001, cumulative[segmentIndex] - startDistance);
				const position = interpolatePoint(points[segmentIndex - 1], points[segmentIndex], Math.max(0, Math.min(1, (distanceNm - startDistance) / segmentDistance)));

				return {
					lat: position.lat,
					lon: position.lon,
					distanceNm,
					eta: new Date(departure.getTime() + distanceNm / speed * 3600000)
				};
			});
		}

		function extraForecastValues(sources) {
			var _a, _b, _c;
			const result = {};

			const specs = {
				Temperature: {
					input: 'temperature',
					scale: 1,
					offset: -273.15
				},
				Feels: {
					input: 'feelTemperature',
					scale: 1,
					offset: -273.15
				},
				Rain: {
					input: 'precipAmount',
					scale: 1 / 25.4,
					offset: 0
				},
				Gust: {
					input: 'windGust',
					scale: 1.94384,
					offset: 0
				}
			};

			for (const [model, source] of Object.entries(sources)) for (const [name, spec] of Object.entries(specs)) {
				const raw = source.index < 0
				? null
				: forecastNumber(source.data, spec.input, source.index);

				result[model === 'gfs' && name === 'Feels'
				? 'feels'
				: model + name] = raw === null ? null : raw * spec.scale + spec.offset;
			}

			for (const [model, source] of Object.entries(sources)) {
				result[model + 'Sky'] = source.index < 0
				? null
				: forecastNumber(source.data, 'icon', source.index);

				const meteo = (_a = source.data) === null || _a === void 0
				? void 0
				: _a.__meteogram;

				const time = source.index < 0
				? null
				: (_c = (_b = source.data) === null || _b === void 0
					? void 0
					: _b.ts) === null || _c === void 0
					? void 0
					: _c[source.index];

				const target = typeof time === 'number'
				? time < 1e12 ? time * 1000 : time
				: NaN;

				const index = meteo ? coveredForecastIndex(meteo.ts, target) : -1;

				const raw = index < 0
				? null
				: forecastNumber(meteo, 'dewPoint', index);

				result[model + 'Dew'] = raw === null ? null : raw - 273.15;
			}

			return result;
		}

		function skyStateForField(key, values) {
			if (key !== 'skyAverage') return skyStateForModel(key, values);
			const members = activeGroupFields(key);
			const states = members.map(member => skyStateForModel(member, values)).filter(state => state !== null);
			const counts = new Map();
			for (const state of states) counts.set(state, (counts.get(state) || 0) + 1);
			const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]);

			return !ordered.length || ordered.length > 1 && ordered[0][1] === ordered[1][1]
			? null
			: ordered[0][0];
		}

		function skyFieldIcon(key, values) {
			const state = skyStateForField(key, values);
			if (!state) return '—';

			const member = key === 'skyAverage'
			? activeGroupFields(key).find(item => skyStateForModel(item, values) === state)
			: key;

			const model = member === 'clouds'
			? 'gfs'
			: String(member).replace(/Sky$/, '');

			const code = values === null || values === void 0
			? void 0
			: values[model + 'Sky'];

			return typeof code === 'number' ? windyWeatherIcon(code) : '—';
		}

		function routeForecastSampleKey(sample) {
			const days = Math.max(1, Math.min(15, Math.floor(Number(weatherSearchDays) || 7)));
			return `forecast-models-v3:${days}:${sample.distanceNm.toFixed(4)}:${sample.lat.toFixed(5)}:${sample.lon.toFixed(5)}:${sample.eta.getTime()}`;
		}

		function calculateRouteForecast() {
			return __awaiter(this, void 0, void 0, function* () {
				var _a, _b;

				if (points.length < 2) {
					invalidateForecast();
					$$invalidate(2, forecastMessage = 'Agrega al menos dos Waypoints para consultar el pronóstico.');

					if (forecastDrawer) {
						forecastDrawer.classList.add('is-open');
						if (forecastReopenButton) forecastReopenButton.hidden = true;
						renderForecastDrawer();
						positionForecastDrawer();
					}

					return;
				}

				const job = ++forecastJob;
				departureAnalysisBusy = false;

				forecastDrawer === null || forecastDrawer === void 0
				? void 0
				: forecastDrawer.classList.remove('is-calculating');

				const previousSamples = new Map(routeForecast.filter(sample => sample.forecastCachedAt && Date.now() - sample.forecastCachedAt < 30 * 60 * 1000).map(sample => [routeForecastSampleKey(sample), sample]));
				const samples = buildRouteForecastSamples();
				const pendingSamples = [];
				const pendingRouteIndexes = [];

				samples.forEach((sample, index) => {
					const previous = previousSamples.get(routeForecastSampleKey(sample));

					if (previous && (previous.values || previous.error)) {
						sample.values = previous.values
						? Object.assign({}, previous.values)
						: undefined;

						sample.icon = previous.icon;
						sample.error = previous.error;
						sample.seaError = previous.seaError;
						sample.forecastCachedAt = previous.forecastCachedAt;
					} else {
						pendingSamples.push(sample);
						pendingRouteIndexes.push(index);
					}
				});

				routeForecast = samples;
				if (forecastDrawer) forecastDrawer.classList.add('is-open');
				if (forecastReopenButton) forecastReopenButton.hidden = true;
				positionForecastDrawer();

				if (samples.length === 0) {
					$$invalidate(2, forecastMessage = 'Agrega al menos dos Waypoints para consultar el pronóstico.');
					return;
				}

				const reusedCount = samples.length - pendingSamples.length;

				$$invalidate(2, forecastMessage = pendingSamples.length
				? `Actualizando ${pendingSamples.length} puntos del pronóstico; se reutilizan ${reusedCount} resultados compatibles…`
				: `Reutilizando los ${reusedCount} pronósticos de la ruta; actualizando sus horas de paso…`);

				$$invalidate(1, forecastBusy = true);
				if (!showWeatherSettingsMenu) renderForecastDrawer();
				requestAnimationFrame(() => positionForecastDrawer());

				try {
					yield loadForecastBundles(pendingSamples, job, (pendingIndex, result) => {
						var _a;
						if (job !== forecastJob) return;
						const index = pendingRouteIndexes[pendingIndex];
						const sample = samples[index];
						if (!sample) return;

						if ('error' in result) {
							sample.error = result.error;
						} else {
							const { data, seaData, ecmwfData, ecmwfSeaData, currentsData, mblueData, iconData, aromeData, seaError, ecmwfError, ecmwfSeaError, currentsError, mblueError, iconError, aromeError } = result.bundle;
							const rowIndex = coveredForecastIndex(data.ts, sample.eta.getTime());

							{
								sample.forecastCachedAt = Date.now();
								const numeric = key => forecastNumber(data, key, rowIndex);

								const ecmwfIndex = ecmwfData
								? coveredForecastIndex(ecmwfData.ts, sample.eta.getTime())
								: -1;

								const ecmwfWind = ecmwfIndex >= 0
								? forecastNumber(ecmwfData, 'wind', ecmwfIndex)
								: null;

								const mblueIndex = mblueData
								? coveredForecastIndex(mblueData.ts, sample.eta.getTime())
								: -1;

								const iconIndex = iconData
								? coveredForecastIndex(iconData.ts, sample.eta.getTime())
								: -1;

								const aromeIndex = aromeData
								? coveredForecastIndex(aromeData.ts, sample.eta.getTime())
								: -1;

								const ecmwfSeaIndex = ecmwfSeaData
								? coveredForecastIndex(ecmwfSeaData.ts, sample.eta.getTime())
								: -1;

								const ecmwfSeaNumeric = key => ecmwfSeaIndex >= 0
								? forecastNumber(ecmwfSeaData, key, ecmwfSeaIndex)
								: null;

								const currentIndex = currentsData
								? coveredForecastIndex(currentsData.ts, sample.eta.getTime())
								: -1;

								const current = forecastCurrentVector(currentsData, currentIndex);
								const currentTide = forecastCurrentVector(currentsData, currentIndex, true);

								const modelWindKnots = (source, index) => {
									const value = index >= 0
									? forecastNumber(source, 'wind', index)
									: null;

									return value === null ? null : value * 1.94384;
								};

								const seaIndex = seaData
								? coveredForecastIndex(seaData.ts, sample.eta.getTime())
								: -1;

								const seaNumeric = key => seaIndex >= 0
								? forecastNumber(seaData, key, seaIndex)
								: null;

								sample.values = Object.assign(
									Object.assign({}, extraForecastValues({
										gfs: { data, index: rowIndex },
										ecmwf: { data: ecmwfData, index: ecmwfIndex },
										mblue: { data: mblueData, index: mblueIndex },
										icon: { data: iconData, index: iconIndex },
										arome: { data: aromeData, index: aromeIndex }
									})),
									{
										temperature: numeric('temperature') === null
										? null
										: numeric('temperature') - 273.15,
										rain: numeric('precipAmount') === null
										? null
										: numeric('precipAmount') / 25.4,
										wind: numeric('wind') === null
										? null
										: numeric('wind') * 1.94384,
										ecmwfWind: ecmwfWind === null ? null : ecmwfWind * 1.94384,
										mblueWind: modelWindKnots(mblueData, mblueIndex),
										iconWind: modelWindKnots(iconData, iconIndex),
										aromeWind: modelWindKnots(aromeData, aromeIndex),
										ecmwfWindDirection: ecmwfIndex >= 0
										? forecastNumber(ecmwfData, 'windDir', ecmwfIndex)
										: null,
										mblueWindDirection: mblueIndex >= 0
										? forecastNumber(mblueData, 'windDir', mblueIndex)
										: null,
										iconWindDirection: iconIndex >= 0
										? forecastNumber(iconData, 'windDir', iconIndex)
										: null,
										aromeWindDirection: aromeIndex >= 0
										? forecastNumber(aromeData, 'windDir', aromeIndex)
										: null,
										gust: numeric('windGust') === null
										? null
										: numeric('windGust') * 1.94384,
										direction: numeric('windDir'),
										waves: seaIndex >= 0 ? seaNumeric('waves') : null,
										wavesDir: seaIndex >= 0 ? seaNumeric('wavesDir') : null,
										swell1: seaIndex >= 0 ? seaNumeric('swell1') : null,
										swell1Dir: seaIndex >= 0 ? seaNumeric('swell1Dir') : null,
										swell1Period: seaIndex >= 0 ? seaNumeric('swell1Period') : null,
										swell2: seaIndex >= 0 ? seaNumeric('swell2') : null,
										swell2Dir: seaIndex >= 0 ? seaNumeric('swell2Dir') : null,
										swell2Period: seaIndex >= 0 ? seaNumeric('swell2Period') : null,
										windWaves: seaIndex >= 0
										? forecastFirstNumber(
												seaData,
												[
													'windWaves',
													'windWavesHeight',
													'wwaves',
													'wwaves_height',
													'wwaves_height-surface',
													'windwaves'
												],
												seaIndex
											)
										: null,
										windWavesDir: seaIndex >= 0
										? forecastFirstNumber(
												seaData,
												[
													'windWavesDir',
													'wwavesDir',
													'wwaves_direction',
													'wwaves_direction-surface',
													'windwavesDir'
												],
												seaIndex
											)
										: null,
										windWavesPeriod: seaIndex >= 0
										? forecastFirstNumber(
												seaData,
												[
													'windWavesPeriod',
													'wwavesPeriod',
													'wwaves_period',
													'wwaves_period-surface',
													'windwavesPeriod'
												],
												seaIndex
											)
										: null,
										current: current.speedKnots,
										currentDir: current.direction,
										currentTide: currentTide.speedKnots,
										currentTideDir: currentTide.direction,
										wavesPeriod: seaIndex >= 0 ? seaNumeric('wavesPeriod') : null,
										wavesPower: seaIndex >= 0 ? seaNumeric('wavesPower') : null,
										ecmwfWaves: ecmwfSeaIndex >= 0 ? ecmwfSeaNumeric('waves') : null,
										ecmwfWavesDir: ecmwfSeaIndex >= 0 ? ecmwfSeaNumeric('wavesDir') : null,
										ecmwfSwell1: ecmwfSeaIndex >= 0 ? ecmwfSeaNumeric('swell1') : null,
										ecmwfSwell1Dir: ecmwfSeaIndex >= 0 ? ecmwfSeaNumeric('swell1Dir') : null,
										ecmwfSwell1Period: ecmwfSeaIndex >= 0
										? ecmwfSeaNumeric('swell1Period')
										: null,
										ecmwfWavesPeriod: ecmwfSeaIndex >= 0
										? ecmwfSeaNumeric('wavesPeriod')
										: null,
										ecmwfWavesPower: ecmwfSeaIndex >= 0
										? ecmwfSeaNumeric('wavesPower')
										: null,
										clouds: numeric('clouds'),
										skyState: forecastSkyState(data, rowIndex),
										convPrecip: numeric('convPrecip'),
										weatherWarnings: numeric('weatherWarnings')
									}
								);

								sample.icon = (_a = data.icon) === null || _a === void 0
								? void 0
								: _a[rowIndex];

								if (sample.values.wind === null) sample.error = 'GFS no devolvió viento para esta ubicación y hora.';
								if (seaError || seaIndex < 0) sample.seaError = seaError || 'GFS Waves no tiene datos para esta hora y ubicación.';

								if (ecmwfError || ecmwfSeaError || currentsError || mblueError || iconError || aromeError) sample.diagnostic = [
									ecmwfError && `ECMWF: ${ecmwfError}`,
									ecmwfSeaError && `ECMWF Waves: ${ecmwfSeaError}`,
									currentsError && `CMEMS: ${currentsError}`,
									mblueError && `mBlue AI: ${mblueError}`,
									iconError && `ICON: ${iconError}`,
									aromeError && `AROME Antillas: ${aromeError}`
								].filter(Boolean).join(' · ');
							}
						}

						routeForecast = [...samples];
						if (!showWeatherSettingsMenu) renderForecastDrawer();
					});

					if (job !== forecastJob) return;
					const unavailable = samples.filter(sample => sample.error).length;
					const unavailableWaves = samples.filter(sample => sample.seaError).length;

					const unavailableEcmwfWind = samples.filter(sample => {
						var _a;

						return !Number.isFinite((_a = sample.values) === null || _a === void 0
						? void 0
						: _a.ecmwfWind);
					}).length;

					const unavailableEcmwfWaves = samples.filter(sample => {
						var _a;

						return !Number.isFinite((_a = sample.values) === null || _a === void 0
						? void 0
						: _a.ecmwfWaves);
					}).length;

					const unavailableMblue = samples.filter(sample => {
						var _a;

						return !Number.isFinite((_a = sample.values) === null || _a === void 0
						? void 0
						: _a.mblueWind);
					}).length;

					const unavailableIcon = samples.filter(sample => {
						var _a;

						return !Number.isFinite((_a = sample.values) === null || _a === void 0
						? void 0
						: _a.iconWind);
					}).length;

					const unavailableArome = samples.filter(sample => {
						var _a;

						return !Number.isFinite((_a = sample.values) === null || _a === void 0
						? void 0
						: _a.aromeWind);
					}).length;

					const unavailableCurrents = samples.filter(sample => {
						var _a;

						return !Number.isFinite((_a = sample.values) === null || _a === void 0
						? void 0
						: _a.current);
					}).length;

					const forecastHorizonEnd = Date.now() + Math.max(1, Number(weatherSearchDays) || 7) * 86400000;

					const arrivalOutsideForecast = ((_b = (_a = samples[samples.length - 1]) === null || _a === void 0
					? void 0
					: _a.eta.getTime()) !== null && _b !== void 0
					? _b
					: 0) > forecastHorizonEnd;

					const horizonNote = arrivalOutsideForecast
					? ` La llegada queda fuera de los ${weatherSearchDays} días seleccionados, así que ese tramo puede no tener pronóstico.`
					: '';

					$$invalidate(2, forecastMessage = `${samples.length - unavailable} de ${samples.length} ubicaciones con datos GFS; ${unavailable} sin dato para su hora. Viento ECMWF disponible en ${samples.length - unavailableEcmwfWind}/${samples.length}; olas ECMWF en ${samples.length - unavailableEcmwfWaves}/${samples.length}; mBlue AI ${samples.length - unavailableMblue}/${samples.length}, ICON ${samples.length - unavailableIcon}/${samples.length}, AROME Antillas ${samples.length - unavailableArome}/${samples.length} y corrientes CMEMS ${samples.length - unavailableCurrents}/${samples.length}.${unavailableWaves
				? ` Olas sin dato en ${unavailableWaves} ubicaciones.`
				: ' Olas GFS Waves consultadas.'}${horizonNote}`);
				} finally {
					if (job === forecastJob) {
						$$invalidate(1, forecastBusy = false);
						if (!showWeatherSettingsMenu) renderForecastDrawer();

						// Updating the route forecast invalidates any eligibility run
						// that was in progress (both jobs share the forecast cache
						// generation). Re-evaluate the departure slots after the route
						// data is complete so the timeline cannot be left without dots.
						if (!liveRouteActive && points.length >= 2 && (hasConfiguredWindowConditions() || departureEligibilityDirty || windowConditionsDirty)) {
							void calculateDepartureEligibility();
						}
					}
				}
			});
		}

		function candidateDepartureTimes() {
			const interval = Math.max(1, Number(departureIntervalHours) || 6);
			const now = new Date();
			const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			const candidates = [];
			const horizon = Math.max(1, Number(weatherSearchDays) || 7);

			// The selected horizon is the departure-search window. Do not shorten it
			// by the route duration: that was hiding the final day of departure slots.
			for (let offset = 0; offset <= horizon + 1; offset++) {
				for (let hour = 0; hour < 24; hour += interval) {
					const departure = new Date(day.getFullYear(), day.getMonth(), day.getDate() + offset, hour);
					if (departure.getTime() >= now.getTime() - 30 * 60000) candidates.push(departure);
				}
			}

			const firstDeparture = candidates[0];
			if (!firstDeparture) return [];
			const searchEnd = new Date(firstDeparture);
			searchEnd.setDate(searchEnd.getDate() + horizon);
			return candidates.filter(departure => departure.getTime() < searchEnd.getTime());
		}

		function calculateDepartureEligibility() {
			return __awaiter(this, void 0, void 0, function* () {
				if (liveRouteActive) return;
				if (points.length < 2) return;

				if (!hasConfiguredWindowConditions()) {
					departureEligibilityDirty = false;

					if (departureAnalysisBusy && !forecastBusy) {
						forecastJob++;
						departureAnalysisBusy = false;

						forecastDrawer === null || forecastDrawer === void 0
						? void 0
						: forecastDrawer.classList.remove('is-calculating');
					}

					departureEvaluations = [];
					updateForecastStatus('Búsqueda de ventana inactiva: no hay condiciones activas.');
					if (!activeWindowCondition) renderForecastDrawer();
					return;
				}

				if (departureAnalysisBusy) {
					departureEligibilityDirty = true;
					return;
				}

				// A route refresh owns the shared forecast generation. Defer this
				// evaluation until its finally block, which will start it again with
				// the latest conditions and search settings.
				if (forecastBusy) {
					departureEligibilityDirty = true;
					windowConditionsDirty = true;
					return;
				}

				departureEligibilityDirty = true;
				windowConditionsDirty = false;
				const job = ++forecastJob;
				$$invalidate(1, forecastBusy = false);
				departureAnalysisBusy = true;

				forecastDrawer === null || forecastDrawer === void 0
				? void 0
				: forecastDrawer.classList.add('is-calculating');

				const departures = candidateDepartureTimes();
				const baseDeparture = departures[0] || new Date();
				const baseSamples = buildRouteForecastSamples(baseDeparture);

				if (!baseSamples.length) {
					departureAnalysisBusy = false;

					forecastDrawer === null || forecastDrawer === void 0
					? void 0
					: forecastDrawer.classList.remove('is-calculating');

					updateForecastStatus('No se pudo iniciar la búsqueda de salidas: no hay ubicaciones de pronóstico en la ruta.');
					if (!activeWindowCondition) renderForecastDrawer();
					return;
				}

				let completedLocations = 0;
				updateForecastStatus(`Buscando la ventana de salida: 0/${baseSamples.length} ubicaciones consultadas; evaluando ${departures.length} horarios…`);
				const dataBySample = new Array(baseSamples.length);

				yield loadForecastBundles(baseSamples, job, (index, result) => {
					dataBySample[index] = 'bundle' in result
					? {
							data: result.bundle.data,
							seaData: result.bundle.seaData,
							ecmwfData: result.bundle.ecmwfData,
							ecmwfSeaData: result.bundle.ecmwfSeaData,
							currentsData: result.bundle.currentsData,
							mblueData: result.bundle.mblueData,
							iconData: result.bundle.iconData,
							aromeData: result.bundle.aromeData
						}
					: null;

					completedLocations++;
					updateForecastStatus(`Buscando la ventana de salida: ${completedLocations}/${baseSamples.length} ubicaciones consultadas; evaluando ${departures.length} horarios…`);
				});

				if (job !== forecastJob) return;
				const durationHours = points.slice(1).reduce((total, point, index) => total + haversineNm(points[index], point) / Math.max(0.1, speedKnots), 0);
				const conditions = windowConstraints;

				departureEvaluations = departures.map(departure => {
					var _a, _b, _c;
					const routeValues = [];
					let available = true;

					baseSamples.forEach((sample, index) => {
						var _a, _b, _c, _d, _e;
						const bundle = dataBySample[index];

						const data = bundle === null || bundle === void 0
						? void 0
						: bundle.data;

						if (!data) {
							available = false;
							return;
						}

						const target = departure.getTime() + sample.distanceNm / Math.max(0.1, speedKnots) * 3600000;
						const rowIndex = coveredForecastIndex(data.ts, target);

						const numeric = (source, key, at = rowIndex) => {
							var _a;

							return Number.isFinite((_a = source === null || source === void 0
							? void 0
							: source[key]) === null || _a === void 0
							? void 0
							: _a[at])
							? Number(source[key][at])
							: null;
						};

						const ecmwfIndex = bundle.ecmwfData
						? coveredForecastIndex(bundle.ecmwfData.ts, target)
						: -1;

						const mblueIndex = bundle.mblueData
						? coveredForecastIndex(bundle.mblueData.ts, target)
						: -1;

						const iconIndex = bundle.iconData
						? coveredForecastIndex(bundle.iconData.ts, target)
						: -1;

						const aromeIndex = bundle.aromeData
						? coveredForecastIndex(bundle.aromeData.ts, target)
						: -1;

						const ecmwfSeaIndex = bundle.ecmwfSeaData
						? coveredForecastIndex(bundle.ecmwfSeaData.ts, target)
						: -1;

						const seaIndex = bundle.seaData
						? coveredForecastIndex(bundle.seaData.ts, target)
						: -1;

						const currentIndex = bundle.currentsData
						? coveredForecastIndex(bundle.currentsData.ts, target)
						: -1;

						if ([
							rowIndex,
							ecmwfIndex,
							mblueIndex,
							iconIndex,
							aromeIndex,
							ecmwfSeaIndex,
							seaIndex,
							currentIndex
						].every(index => index < 0)) available = false;

						const current = forecastCurrentVector(bundle.currentsData, currentIndex);
						const currentTide = forecastCurrentVector(bundle.currentsData, currentIndex, true);

						const waves = seaIndex >= 0
						? numeric(bundle.seaData, 'waves', seaIndex)
						: null;

						const previousDistance = (_b = (_a = baseSamples[index - 1]) === null || _a === void 0
						? void 0
						: _a.distanceNm) !== null && _b !== void 0
						? _b
						: sample.distanceNm;

						const nextDistance = (_d = (_c = baseSamples[index + 1]) === null || _c === void 0
						? void 0
						: _c.distanceNm) !== null && _d !== void 0
						? _d
						: sample.distanceNm;

						const hours = Math.max(0, (nextDistance - previousDistance) / (2 * Math.max(0.1, speedKnots)));

						routeValues.push(Object.assign(
							Object.assign({}, extraForecastValues({
								gfs: { data, index: rowIndex },
								ecmwf: {
									data: bundle.ecmwfData,
									index: ecmwfIndex
								},
								mblue: {
									data: bundle.mblueData,
									index: mblueIndex
								},
								icon: { data: bundle.iconData, index: iconIndex },
								arome: {
									data: bundle.aromeData,
									index: aromeIndex
								}
							})),
							{
								temperature: numeric(data, 'temperature') === null
								? null
								: numeric(data, 'temperature') - 273.15,
								rain: numeric(data, 'precipAmount') === null
								? null
								: numeric(data, 'precipAmount') / 25.4,
								wind: numeric(data, 'wind') === null
								? null
								: numeric(data, 'wind') * 1.94384,
								ecmwfWind: ecmwfIndex < 0 || numeric(bundle.ecmwfData, 'wind', ecmwfIndex) === null
								? null
								: numeric(bundle.ecmwfData, 'wind', ecmwfIndex) * 1.94384,
								mblueWind: mblueIndex < 0 || numeric(bundle.mblueData, 'wind', mblueIndex) === null
								? null
								: numeric(bundle.mblueData, 'wind', mblueIndex) * 1.94384,
								iconWind: iconIndex < 0 || numeric(bundle.iconData, 'wind', iconIndex) === null
								? null
								: numeric(bundle.iconData, 'wind', iconIndex) * 1.94384,
								aromeWind: aromeIndex < 0 || numeric(bundle.aromeData, 'wind', aromeIndex) === null
								? null
								: numeric(bundle.aromeData, 'wind', aromeIndex) * 1.94384,
								gust: numeric(data, 'windGust') === null
								? null
								: numeric(data, 'windGust') * 1.94384,
								direction: numeric(data, 'windDir'),
								waves,
								wavesDir: seaIndex >= 0
								? numeric(bundle.seaData, 'wavesDir', seaIndex)
								: null,
								swell1Dir: seaIndex >= 0
								? numeric(bundle.seaData, 'swell1Dir', seaIndex)
								: null,
								swell2Dir: seaIndex >= 0
								? numeric(bundle.seaData, 'swell2Dir', seaIndex)
								: null,
								windWavesDir: seaIndex >= 0
								? forecastFirstNumber(
										bundle.seaData,
										[
											'windWavesDir',
											'wwavesDir',
											'wwaves_direction',
											'wwaves_direction-surface',
											'windwavesDir'
										],
										seaIndex
									)
								: null,
								currentDir: current.direction,
								currentTideDir: currentTide.direction,
								ecmwfWavesDir: ecmwfSeaIndex >= 0
								? numeric(bundle.ecmwfSeaData, 'wavesDir', ecmwfSeaIndex)
								: null,
								ecmwfSwell1Dir: ecmwfSeaIndex >= 0
								? numeric(bundle.ecmwfSeaData, 'swell1Dir', ecmwfSeaIndex)
								: null,
								ecmwfWindDirection: ecmwfIndex < 0
								? null
								: numeric(bundle.ecmwfData, 'windDir', ecmwfIndex),
								mblueWindDirection: mblueIndex < 0
								? null
								: numeric(bundle.mblueData, 'windDir', mblueIndex),
								iconWindDirection: iconIndex < 0
								? null
								: numeric(bundle.iconData, 'windDir', iconIndex),
								aromeWindDirection: aromeIndex < 0
								? null
								: numeric(bundle.aromeData, 'windDir', aromeIndex),
								swell1: seaIndex >= 0
								? numeric(bundle.seaData, 'swell1', seaIndex)
								: null,
								swell1Period: seaIndex >= 0
								? numeric(bundle.seaData, 'swell1Period', seaIndex)
								: null,
								swell2: seaIndex >= 0
								? numeric(bundle.seaData, 'swell2', seaIndex)
								: null,
								swell2Period: seaIndex >= 0
								? numeric(bundle.seaData, 'swell2Period', seaIndex)
								: null,
								windWaves: seaIndex >= 0
								? forecastFirstNumber(
										bundle.seaData,
										[
											'windWaves',
											'windWavesHeight',
											'wwaves',
											'wwaves_height',
											'wwaves_height-surface',
											'windwaves'
										],
										seaIndex
									)
								: null,
								windWavesPeriod: seaIndex >= 0
								? forecastFirstNumber(
										bundle.seaData,
										[
											'windWavesPeriod',
											'wwavesPeriod',
											'wwaves_period',
											'wwaves_period-surface',
											'windwavesPeriod'
										],
										seaIndex
									)
								: null,
								current: current.speedKnots,
								currentTide: currentTide.speedKnots,
								wavesPeriod: seaIndex >= 0
								? numeric(bundle.seaData, 'wavesPeriod', seaIndex)
								: null,
								wavesPower: seaIndex >= 0
								? numeric(bundle.seaData, 'wavesPower', seaIndex)
								: null,
								ecmwfWaves: ecmwfSeaIndex >= 0
								? numeric(bundle.ecmwfSeaData, 'waves', ecmwfSeaIndex)
								: null,
								ecmwfSwell1: ecmwfSeaIndex >= 0
								? numeric(bundle.ecmwfSeaData, 'swell1', ecmwfSeaIndex)
								: null,
								ecmwfSwell1Period: ecmwfSeaIndex >= 0
								? numeric(bundle.ecmwfSeaData, 'swell1Period', ecmwfSeaIndex)
								: null,
								ecmwfWavesPeriod: ecmwfSeaIndex >= 0
								? numeric(bundle.ecmwfSeaData, 'wavesPeriod', ecmwfSeaIndex)
								: null,
								ecmwfWavesPower: ecmwfSeaIndex >= 0
								? numeric(bundle.ecmwfSeaData, 'wavesPower', ecmwfSeaIndex)
								: null,
								clouds: numeric(data, 'clouds'),
								skyState: forecastSkyState(data, rowIndex),
								icon: (_e = data.icon) === null || _e === void 0
								? void 0
								: _e[rowIndex],
								hours
							}
						));
					});

					const average = key => {
						const values = routeValues.map(value => value[key]).filter(value => value !== null);

						return values.length
						? values.reduce((sum, value) => sum + value, 0) / values.length
						: null;
					};

					const windAverages = routeValues.map(value => averageWindForValues(value));

					const windAverage = windAverages.length === baseSamples.length && windAverages.every(value => value !== null)
					? Math.max(...windAverages)
					: null;

					const maximum = key => {
						const values = routeValues.map(value => value[key]).filter(value => value !== null);
						return values.length ? Math.max(...values) : null;
					};

					const rain = routeValues.some(value => value.rain !== null)
					? routeValues.reduce((sum, value) => sum + (value.rain || 0) * value.hours, 0)
					: null;

					const direction = averageDirection(routeValues.map(value => value.direction).filter(value => value !== null));
					const ecmwfWindDirection = averageDirection(routeValues.map(value => value.ecmwfWindDirection).filter(value => value !== null));
					const mblueWindDirection = averageDirection(routeValues.map(value => value.mblueWindDirection).filter(value => value !== null));
					const iconWindDirection = averageDirection(routeValues.map(value => value.iconWindDirection).filter(value => value !== null));
					const aromeWindDirection = averageDirection(routeValues.map(value => value.aromeWindDirection).filter(value => value !== null));

					const clouds = Math.max(-1, ...routeValues.map(value => {
						var _a;

						return (_a = cloudCategory(value.clouds)) !== null && _a !== void 0
						? _a
						: -1;
					}));

					const cloudMax = clouds < 0 ? null : clouds;

					const skyStates = available && routeValues.every(value => value.skyState !== null)
					? routeValues.map(value => value.skyState)
					: null;

					const result = {
						departure,
						arrival: new Date(departure.getTime() + durationHours * 3600000),
						temperature: average('temperature'),
						rain,
						windAverage,
						wind: maximum('wind'),
						ecmwfWind: maximum('ecmwfWind'),
						mblueWind: maximum('mblueWind'),
						iconWind: maximum('iconWind'),
						aromeWind: maximum('aromeWind'),
						gust: maximum('gust'),
						direction,
						ecmwfWindDirection,
						mblueWindDirection,
						iconWindDirection,
						aromeWindDirection,
						skyStates,
						waves: maximum('waves'),
						swell1: maximum('swell1'),
						swell1Period: maximum('swell1Period'),
						swell2: maximum('swell2'),
						swell2Period: maximum('swell2Period'),
						windWaves: maximum('windWaves'),
						windWavesPeriod: maximum('windWavesPeriod'),
						current: maximum('current'),
						currentTide: maximum('currentTide'),
						wavesPeriod: maximum('wavesPeriod'),
						wavesPower: maximum('wavesPower'),
						ecmwfWaves: maximum('ecmwfWaves'),
						ecmwfSwell1: maximum('ecmwfSwell1'),
						ecmwfSwell1Period: maximum('ecmwfSwell1Period'),
						ecmwfWavesPeriod: maximum('ecmwfWavesPeriod'),
						ecmwfWavesPower: maximum('ecmwfWavesPower'),
						clouds: cloudMax,
						icon: (_a = routeValues[0]) === null || _a === void 0
						? void 0
						: _a.icon,
						available,
						passes: null,
						hasConstraints: false
					};

					const checks = [];
					let needsForecastData = false;
					let directionUnknown = false;

					const boundNumber = value => value === '' || value === null || value === undefined || !Number.isFinite(Number(value))
					? null
					: Number(value);

					const checkRange = (value, bounds) => {
						const min = boundNumber(bounds.min), max = boundNumber(bounds.max);

						if (min !== null || max !== null) {
							needsForecastData = true;
							checks.push(value !== null && (min === null || value >= min) && (max === null || value <= max));
						}
					};

					for (const key of Object.keys(additionalGroups)) {
						if (activeGroupFields(key).length < 2) continue;

						if ([
							'temperatureAverage',
							'feelsAverage',
							'rainAverage',
							'gustAverage',
							'dewAverage',
							'skyAverage',
							'directionAverage'
						].includes(key)) continue;

						const bounds = conditions[key];
						const min = boundNumber(bounds.min), max = boundNumber(bounds.max);
						if (min === null && max === null) continue;
						needsForecastData = true;
						const values = routeValues.map(value => groupValue(key, value));
						const complete = values.length === baseSamples.length && values.every(value => value !== null);

						const resultValue = complete
						? additionalGroups[key].circular
							? averageDirection(values)
							: Math.max(...values)
						: null;

						checks.push(resultValue !== null && (additionalGroups[key].circular && min !== null && max !== null && min > max
						? resultValue >= min || resultValue <= max
						: (min === null || resultValue >= min) && (max === null || resultValue <= max)));
					}

					for (const key of [
						...newModelFields,
						'temperatureAverage',
						'feelsAverage',
						'rainAverage',
						'gustAverage',
						'dewAverage'
					]) {
						if (!windowConditionConfigured(key)) continue;
						const bounds = conditions[key];
						const min = boundNumber(bounds.min), max = boundNumber(bounds.max);
						needsForecastData = true;

						const values = routeValues.map(value => additionalGroups[key]
						? groupValue(key, value)
						: value[key]);

						checks.push(values.length === baseSamples.length && values.every(value => typeof value === 'number' && Number.isFinite(value) && (min === null || value >= min) && (max === null || value <= max)));
					}

					for (const key of windowFieldKeys) {
						if (!hasDirectionWheel(key) || !windowConditionConfigured(key) || !selectedDirections(key).length) continue;
						needsForecastData = true;
						const matches = routeValues.map(value => directionMatches(key, value));
						if (matches.length !== baseSamples.length || matches.some(value => value === null)) directionUnknown = true;
						checks.push(!matches.some(value => value === false));
					}

					checkRange(result.temperature, conditions.temperature);
					checkRange(result.rain, conditions.rain);
					if (activeWindModelFields().length > 1) checkRange(result.windAverage, conditions.windAverage);
					checkRange(result.wind, conditions.wind);
					checkRange(result.ecmwfWind, conditions.ecmwfWind);
					checkRange(result.mblueWind, conditions.mblueWind);
					checkRange(result.iconWind, conditions.iconWind);
					checkRange(result.aromeWind, conditions.aromeWind);
					checkRange(result.gust, conditions.gust);
					checkRange(result.waves, conditions.waves);
					checkRange(result.swell1, conditions.swell1);
					checkRange(result.swell1Period, conditions.swell1Period);
					checkRange(result.swell2, conditions.swell2);
					checkRange(result.swell2Period, conditions.swell2Period);
					checkRange(result.windWaves, conditions.windWaves);
					checkRange(result.windWavesPeriod, conditions.windWavesPeriod);
					checkRange(result.current, conditions.current);
					checkRange(result.currentTide, conditions.currentTide);
					checkRange(result.wavesPeriod, conditions.wavesPeriod);
					checkRange(result.wavesPower, conditions.wavesPower);
					checkRange(result.ecmwfWaves, conditions.ecmwfWaves);
					checkRange(result.ecmwfSwell1, conditions.ecmwfSwell1);
					checkRange(result.ecmwfSwell1Period, conditions.ecmwfSwell1Period);
					checkRange(result.ecmwfWavesPeriod, conditions.ecmwfWavesPeriod);
					checkRange(result.ecmwfWavesPower, conditions.ecmwfWavesPower);

					for (const skyKey of ['clouds', ...skyModelFields, 'skyAverage']) {
						if (!windowConditionConfigured(skyKey)) continue;
						needsForecastData = true;
						const states = routeValues.map(value => skyStateForField(skyKey, value));
						if (states.length !== baseSamples.length || states.some(state => state === null)) directionUnknown = true;
						const allowed = conditions[skyKey].states;
						checks.push(!states.some(state => state !== null && !allowed.includes(state)));
					}

					if (windowConditionConfigured('arrival')) checks.push(arrivalMatches(result.arrival));
					result.hasConstraints = checks.length > 0;

					result.passes = checks.length
					? checks.some(value => !value)
						? false
						: needsForecastData && (!available || directionUnknown)
							? null
							: true
					: null;

					if (result.passes === true) {
						const quality = departureQualityMetrics(routeValues);

						result.qualityMargin = (_b = quality === null || quality === void 0
						? void 0
						: quality.margin) !== null && _b !== void 0
						? _b
						: null;

						result.qualityAverage = (_c = quality === null || quality === void 0
						? void 0
						: quality.average) !== null && _c !== void 0
						? _c
						: null;
					}

					return result;
				});

				rankPassingDepartures(departureEvaluations);
				departureAnalysisBusy = false;
				departureEligibilityDirty = false;

				forecastDrawer === null || forecastDrawer === void 0
				? void 0
				: forecastDrawer.classList.remove('is-calculating');

				const passing = departureEvaluations.filter(item => item.passes === true).length;
				const failing = departureEvaluations.filter(item => item.passes === false).length;
				const unknown = departureEvaluations.length - passing - failing;
				updateForecastStatus(`Ventana evaluada: ${passing}/${departureEvaluations.length} salidas cumplen; ${failing} no cumplen; ${unknown} sin datos suficientes.`);
				if (!activeWindowCondition) renderForecastDrawer();
			});
		}

		function forecastColorStyle(ident, value, factor) {
			var _a;
			if (value === null || value === undefined || !Number.isFinite(value)) return '';

			return ((_a = colors[ident]) === null || _a === void 0
			? void 0
			: _a.color(value * factor)) || '';
		}

		function updateForecastStatus(message) {
			$$invalidate(2, forecastMessage = message);
		}

		function saveWindowConstraints() {
			try {
				localStorage.setItem('route-builder-window-constraints', JSON.stringify(windowConstraints));
				localStorage.setItem('route-builder-direction-selections-v1', JSON.stringify(directionSelections));
				localStorage.setItem('route-builder-arrival-selection-v1', JSON.stringify({ hours: arrivalHours, days: arrivalDays }));
			} catch(/* Keep the current conditions for this session. */ _a) {
				
			} /* Keep the current conditions for this session. */
		}

		function applyLabelFontSizes() {
			$$invalidate(6, waypointLabelFontSize = Math.min(18, Math.max(8, Number(waypointLabelFontSize) || 10)));
			$$invalidate(7, segmentLabelFontSize = Math.min(18, Math.max(8, Number(segmentLabelFontSize) || 11)));

			try {
				localStorage.setItem('route-builder-waypoint-label-font-size', String(waypointLabelFontSize));
				localStorage.setItem('route-builder-segment-label-font-size', String(segmentLabelFontSize));
			} catch(/* Keep the current sizes for this session. */ _a) {
				
			} /* Keep the current sizes for this session. */

			redrawMap();
		}

		function applyWaypointSize() {
			$$invalidate(5, waypointSize = Math.min(40, Math.max(14, Number(waypointSize) || 18)));

			try {
				localStorage.setItem('route-builder-waypoint-size', String(waypointSize));
			} catch(/* Keep the current size for this session. */ _a) {
				
			} /* Keep the current size for this session. */

			redrawMap();
		}

		function applyRouteSettings() {
			const parsedSpeed = Number(speedKnots);

			speedKnots = Number.isFinite(parsedSpeed) && parsedSpeed > 0
			? parsedSpeed
			: 10;

			try {
				localStorage.setItem('route-builder-speed-knots', String(speedKnots));
			} catch(/* Keep the current settings for this session. */ _a) {
				
			} /* Keep the current settings for this session. */

			departureEvaluations = [];
			saveRoute();
			redrawMap();

			if (forecastDrawer === null || forecastDrawer === void 0
			? void 0
			: forecastDrawer.classList.contains('is-open')) {
				void calculateRouteForecast();
			}
		}

		onDestroy(() => {

			gpsRequestGeneration++;
			if (liveRefreshTimer !== null) window.clearInterval(liveRefreshTimer);
			if (liveWaypointTimer !== null) window.clearInterval(liveWaypointTimer);
			if (navigationRefreshTimer !== null) window.clearInterval(navigationRefreshTimer);

			centerLayoutObserver === null || centerLayoutObserver === void 0
			? void 0
			: centerLayoutObserver.disconnect();

			if (centerLayoutFrame !== null) window.cancelAnimationFrame(centerLayoutFrame);

			navigationPanel === null || navigationPanel === void 0
			? void 0
			: navigationPanel.remove();

			if (gpsWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatchId);
			gpsWatchId = null;

			gpsPositionMarker === null || gpsPositionMarker === void 0
			? void 0
			: gpsPositionMarker.removeFrom(map);

			gpsCourseOverlay === null || gpsCourseOverlay === void 0
			? void 0
			: gpsCourseOverlay.remove();

			windIndicatorOverlay === null || windIndicatorOverlay === void 0
			? void 0
			: windIndicatorOverlay.remove();

			waveIndicatorOverlay === null || waveIndicatorOverlay === void 0
			? void 0
			: waveIndicatorOverlay.remove();

			windRoseOverlay === null || windRoseOverlay === void 0
			? void 0
			: windRoseOverlay.remove();

			headingDegreesOverlay === null || headingDegreesOverlay === void 0
			? void 0
			: headingDegreesOverlay.remove();

			upwindLaylineLayers.forEach(layer => layer.removeFrom(map));
			downwindLaylineLayers.forEach(layer => layer.removeFrom(map));
			if (departureScrollCommitTimer !== null) window.clearTimeout(departureScrollCommitTimer);
			window.removeEventListener('mousedown', onMapMouseDown, true);
			window.removeEventListener('mousemove', onMapMouseMove, true);
			window.removeEventListener('mouseup', onMapMouseUp, true);
			window.removeEventListener('click', onMapDomClick, true);
			window.removeEventListener('dblclick', onMapDomDoubleClick, true);

			waypointLayer === null || waypointLayer === void 0
			? void 0
			: waypointLayer.removeFrom(map);

			pastWaypointLayer === null || pastWaypointLayer === void 0
			? void 0
			: pastWaypointLayer.removeFrom(map);

			pastRouteLine === null || pastRouteLine === void 0
			? void 0
			: pastRouteLine.removeFrom(map);

			map.off('move zoomend', redrawMapOverlays);
			map.off('dragstart', stopFollowingOnMapDrag);
			map.off('resize', positionForecastDrawer);
			map.off('resize', redrawGpsCourseLine);
			window.removeEventListener('resize', positionForecastDrawer);
			window.removeEventListener('resize', scheduleCenterForLayoutChange);

			distanceLabelOverlay === null || distanceLabelOverlay === void 0
			? void 0
			: distanceLabelOverlay.remove();

			routeLine === null || routeLine === void 0
			? void 0
			: routeLine.removeFrom(map);

			forecastHighlightMarker === null || forecastHighlightMarker === void 0
			? void 0
			: forecastHighlightMarker.removeFrom(map);

			forecastDrawer === null || forecastDrawer === void 0
			? void 0
			: forecastDrawer.remove();

			forecastReopenButton === null || forecastReopenButton === void 0
			? void 0
			: forecastReopenButton.remove();

			gpsButton === null || gpsButton === void 0
			? void 0
			: gpsButton.remove();

			liveButton === null || liveButton === void 0
			? void 0
			: liveButton.remove();

			centerButton === null || centerButton === void 0
			? void 0
			: centerButton.remove();

			zoomInButton === null || zoomInButton === void 0
			? void 0
			: zoomInButton.remove();

			zoomOutButton === null || zoomOutButton === void 0
			? void 0
			: zoomOutButton.remove();

			windyControlsStyles.forEach(style => style.remove());
			windyControlsStyles = [];
			document.body.classList.remove('route-builder-fullscreen');
			setForecastOpenState(false);
		});

		function input0_change_input_handler() {
			waypointLabelFontSize = to_number(this.value);
			$$invalidate(6, waypointLabelFontSize);
		}

		const change_handler = (row, event) => handleLabelPositionChange(event, 'waypoint', row.field, 'above');
		const change_handler_1 = (row, event) => handleLabelPositionChange(event, 'waypoint', row.field, 'below');

		function input1_change_input_handler() {
			segmentLabelFontSize = to_number(this.value);
			$$invalidate(7, segmentLabelFontSize);
		}

		const change_handler_2 = (row, event) => handleLabelPositionChange(event, 'segment', row.field, 'above');
		const change_handler_3 = (row, event) => handleLabelPositionChange(event, 'segment', row.field, 'below');

		function select0_change_handler() {
			distanceUnit = select_value(this);
			$$invalidate(4, distanceUnit);
		}

		function select1_change_handler() {
			distanceFont = select_value(this);
			$$invalidate(3, distanceFont);
		}

		function input2_change_input_handler() {
			waypointSize = to_number(this.value);
			$$invalidate(5, waypointSize);
		}

		function details_binding($$value) {
			binding_callbacks[$$value ? 'unshift' : 'push'](() => {
				mapLabelSettings = $$value;
				$$invalidate(10, mapLabelSettings);
			});
		}

		$$self.$$.update = () => {
			if ($$self.$$.dirty[0] & /*showWaypointDate, showWaypointHour, showWaypointDistanceAccumulated, showWaypointTimeAccumulated, showWaypointDistanceRemaining, showWaypointTimeRemaining*/ 66060288 | $$self.$$.dirty[1] & /*waypointFieldPositions, waypointFieldOrder*/ 6) {
				$$invalidate(8, waypointLabelRows = [
					showWaypointDate,
					showWaypointHour,
					showWaypointDistanceAccumulated,
					showWaypointTimeAccumulated,
					showWaypointDistanceRemaining,
					showWaypointTimeRemaining,
					waypointFieldPositions,
					waypointFieldOrder
				] && waypointFieldOrder.map(field => {
					var _a;

					return {
						field,
						position: isWaypointFieldVisible(field)
						? (_a = waypointFieldPositions[field]) !== null && _a !== void 0
							? _a
							: 'below'
						: null
					};
				}));
			}

			if ($$self.$$.dirty[0] & /*showSegmentTime, showSegmentBearing, showSegmentDistance, segmentTimePosition, segmentBearingPosition*/ 2080374784 | $$self.$$.dirty[1] & /*segmentDistancePosition, segmentFieldOrder*/ 9) {
				$$invalidate(9, segmentLabelRows = [
					showSegmentTime,
					showSegmentBearing,
					showSegmentDistance,
					segmentTimePosition,
					segmentBearingPosition,
					segmentDistancePosition,
					segmentFieldOrder
				] && segmentFieldOrder.map(field => {
					const active = field === 'segment-time'
					? showSegmentTime
					: field === 'segment-bearing'
						? showSegmentBearing
						: showSegmentDistance;

					const position = field === 'segment-time'
					? segmentTimePosition
					: field === 'segment-bearing'
						? segmentBearingPosition
						: segmentDistancePosition;

					return {
						field,
						position: active ? position : null
					};
				}));
			}
		};

		return [
			points,
			forecastBusy,
			forecastMessage,
			distanceFont,
			distanceUnit,
			waypointSize,
			waypointLabelFontSize,
			segmentLabelFontSize,
			waypointLabelRows,
			segmentLabelRows,
			mapLabelSettings,
			pluginTitle,
			fieldNames,
			handleLabelPositionChange,
			applyDistanceFont,
			applyDistanceUnit,
			calculateRouteForecast,
			applyLabelFontSizes,
			applyWaypointSize,
			onopen,
			showWaypointDate,
			showWaypointHour,
			showWaypointDistanceAccumulated,
			showWaypointTimeAccumulated,
			showWaypointDistanceRemaining,
			showWaypointTimeRemaining,
			showSegmentTime,
			showSegmentBearing,
			showSegmentDistance,
			segmentTimePosition,
			segmentBearingPosition,
			segmentDistancePosition,
			waypointFieldPositions,
			waypointFieldOrder,
			segmentFieldOrder,
			input0_change_input_handler,
			change_handler,
			change_handler_1,
			input1_change_input_handler,
			change_handler_2,
			change_handler_3,
			select0_change_handler,
			select1_change_handler,
			input2_change_input_handler,
			details_binding
		];
	}

	class Plugin extends SvelteComponent {
		constructor(options) {
			super();
			init(this, options, instance, create_fragment, safe_not_equal, { onopen: 19 }, add_css, [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]);
		}

		get onopen() {
			return this.$$.ctx[19];
		}
	}

	new Plugin({target: document.getElementById('navigator')});
	const toggle = document.getElementById('seamarks');
	toggle.addEventListener('click', () => {
	  const active = map.hasLayer(seamarks);
	  if (active) map.removeLayer(seamarks); else seamarks.addTo(map);
	  toggle.setAttribute('aria-pressed', String(!active));
	});
	if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.error);

})();
//# sourceMappingURL=app.js.map
