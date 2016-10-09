import typescript from 'rollup-plugin-typescript';
import uglify from 'rollup-plugin-uglify';
// import nodeResolve from 'rollup-plugin-node-resolve';

export default {
  entry: './src/main.ts',
  format: 'iife',
  dest: 'build/index.js',
  sourceMap: true,
  plugins: [
    // nodeResolve({ jsnext: true, main: true }),
    typescript({
      // Force usage of same version of typescript as the project:
      typescript: require('typescript')
    }),
    // uglify({sourceMap: true}),
  ]
}