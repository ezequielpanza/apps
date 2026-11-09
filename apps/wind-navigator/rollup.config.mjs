import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import svelte from 'rollup-plugin-svelte';
import preprocess from 'svelte-preprocess';
import { less } from 'svelte-preprocess-less';
export default {input:'src/main.js',output:{file:'dist/app.js',format:'iife',sourcemap:true},
 plugins:[svelte({emitCss:false,preprocess:{script:preprocess().script,style:less({sourceMap:false,math:'always'})}}),resolve({browser:true,dedupe:['svelte']}),commonjs()]};
