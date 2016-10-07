import typescript from 'rollup-plugin-typescript';
import uglify from 'rollup-plugin-uglify';
import filesize from 'rollup-plugin-filesize';
import json from 'rollup-plugin-json';

export default {
  entry: './src/main.ts',
  format: 'iife',
  dest: 'build/nabab.js',
  moduleName: 'nabab',
  sourceMap: true,

  plugins: [
    json(),
    typescript(),
    uglify({sourceMap: true}),
    filesize(),
  ]
}
