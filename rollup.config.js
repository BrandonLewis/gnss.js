import terser from '@rollup/plugin-terser';
import { readFileSync } from 'fs';

// Read package.json
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

// Banner for the builds
const banner = `/**
 * ${pkg.name} v${pkg.version}
 * ${pkg.description}
 * ${pkg.homepage}
 * 
 * @license ${pkg.license}
 * @copyright ${new Date().getFullYear()} ${pkg.author}
 */
`;

export default [
  // UMD build for browsers (production, minified)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/gnss.min.js',
      format: 'umd',
      name: 'GnssModule',
      banner,
      sourcemap: true,
      plugins: [terser]
    }
  },
  // UMD build for browsers (development, non-minified)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/gnss.js',
      format: 'umd',
      name: 'GnssModule',
      banner,
      sourcemap: true
    }
  },
  // ESM build for modern environments
  {
    input: 'src/index.js',
    output: {
      file: pkg.module,
      format: 'esm',
      banner,
      sourcemap: true
    }
  }
];