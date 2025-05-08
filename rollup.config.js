export default {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/gnss.js',
      format: 'umd',
      name: 'GnssModule',
      sourcemap: true
    },
    {
      file: 'dist/gnss.esm.js',
      format: 'esm',
      sourcemap: true
    }
  ]
};