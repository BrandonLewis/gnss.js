## [1.3.1](https://github.com/BrandonLewis/gnss.js/compare/v1.3.0...v1.3.1) (2025-05-09)


### Bug Fixes

* update filters option to use null instead of empty array ([4d4f991](https://github.com/BrandonLewis/gnss.js/commit/4d4f9916acbb079de78d16555c9bd4bd90345c97))

# [1.3.0](https://github.com/BrandonLewis/gnss.js/compare/v1.2.10...v1.3.0) (2025-05-09)


### Bug Fixes

* remove unnecessary entries from .gitignore ([3bca13f](https://github.com/BrandonLewis/gnss.js/commit/3bca13fe3fffbae96187b8cef25e386991c4a065))


### Features

* update semantic-release to build and deploy CDN files directly ([fbcbac1](https://github.com/BrandonLewis/gnss.js/commit/fbcbac1a13ff90842d98324ee7d8daf0ea20312f))

## [1.2.10](https://github.com/BrandonLewis/gnss.js/compare/v1.2.9...v1.2.10) (2025-05-09)


### Bug Fixes

* remove unnecessary entries from .gitignore ([8f97b9d](https://github.com/BrandonLewis/gnss.js/commit/8f97b9d0a18555213b62e434e6bbbf3ff45c84cf))

## [1.2.9](https://github.com/BrandonLewis/gnss.js/compare/v1.2.8...v1.2.9) (2025-05-09)


### Bug Fixes

* remove unnecessary entries from .gitignore ([165fba6](https://github.com/BrandonLewis/gnss.js/commit/165fba6f0ff5279107274333219133caccf22f95))

## [1.2.8](https://github.com/BrandonLewis/gnss.js/compare/v1.2.7...v1.2.8) (2025-05-09)


### Bug Fixes

* remove unnecessary entries from .gitignore ([82e04ba](https://github.com/BrandonLewis/gnss.js/commit/82e04bacc086a8705e6d4d20c2686ac9c003cd87))

## [1.2.7](https://github.com/BrandonLewis/gnss.js/compare/v1.2.6...v1.2.7) (2025-05-09)


### Bug Fixes

* resolve 'refusing to merge unrelated histories' error in CDN workflow ([3e7d8ee](https://github.com/BrandonLewis/gnss.js/commit/3e7d8eed01a9dc272b1e91806026804aa5d90618))

## [1.2.6](https://github.com/BrandonLewis/gnss.js/compare/v1.2.5...v1.2.6) (2025-05-09)


### Bug Fixes

* improve CDN deployment with file copy verification ([54f533f](https://github.com/BrandonLewis/gnss.js/commit/54f533f039abe8a06235fec362ca0c2b72096bd5))

## [1.2.5](https://github.com/BrandonLewis/gnss.js/compare/v1.2.4...v1.2.5) (2025-05-09)


### Bug Fixes

* add uncommitted changes handling to CDN workflow ([2c0a419](https://github.com/BrandonLewis/gnss.js/commit/2c0a419faa8f4c238939a207fe31502c271292f7))

## [1.2.4](https://github.com/BrandonLewis/gnss.js/compare/v1.2.3...v1.2.4) (2025-05-09)


### Bug Fixes

* enhance CDN deployment workflow reliability ([4440715](https://github.com/BrandonLewis/gnss.js/commit/4440715e5ff387a27c56e76712741a720623e7ce))

## [1.2.3](https://github.com/BrandonLewis/gnss.js/compare/v1.2.2...v1.2.3) (2025-05-09)


### Bug Fixes

* update npm publish access and package name for scoped package ([50408ea](https://github.com/BrandonLewis/gnss.js/commit/50408ea634e4002a7fbb6c9ba0d45acf1369bba2))

## [1.2.2](https://github.com/BrandonLewis/gnss.js/compare/v1.2.1...v1.2.2) (2025-05-09)


### Bug Fixes

* resolve npm publishing error with non-scoped package ([a7c0e99](https://github.com/BrandonLewis/gnss.js/commit/a7c0e99eaf92d4790dfee3fe8761df63ca423176))

## [1.2.1](https://github.com/BrandonLewis/gnss.js/compare/v1.2.0...v1.2.1) (2025-05-09)


### Bug Fixes

* resolve npm publishing error with scoped package ([643974e](https://github.com/BrandonLewis/gnss.js/commit/643974e674db2f28e9f64adc4d20d34db20ea899))

# [1.2.0](https://github.com/BrandonLewis/gnss.js/compare/v1.1.0...v1.2.0) (2025-05-09)


### Bug Fixes

* update package name and publishing workflow ([306964c](https://github.com/BrandonLewis/gnss.js/commit/306964c24549cd47088d5768905a6411f5666d49))


### Features

* add device settings configuration and event handling in GNSS module ([981cdd2](https://github.com/BrandonLewis/gnss.js/commit/981cdd22a96f2a66a13cfb0f1a1cf07da67763ba))

# [1.1.0](https://github.com/BrandonLewis/gnss.js/compare/v1.0.1...v1.1.0) (2025-05-08)


### Features

* add device settings configuration and event handling in GNSS module ([b0177bf](https://github.com/BrandonLewis/gnss.js/commit/b0177bf13184599e9ade8b998e2465f45e176a3f))
* add direct Bluetooth API testing and improve device connection handling ([cb71687](https://github.com/BrandonLewis/gnss.js/commit/cb7168765f02760c01dda73a9d5966f645fe248d))
* add direct Bluetooth API testing and improve device connection handling ([d28b0d6](https://github.com/BrandonLewis/gnss.js/commit/d28b0d6d6be7e74500f2a32ebcfcec6f55de215d))

# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## 0.1.0 (2023-07-25)

### Features

* Initial release
* Device connection via Web Bluetooth or Web Serial
* NMEA sentence parsing
* NTRIP client for RTK corrections
* Position and satellite tracking
* Event-based architecture
