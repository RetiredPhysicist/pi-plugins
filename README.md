# pi-plugins

RetiredPhysicist monorepo for Pi extensions.

Each package keeps its own npm name, version, and release cadence:

| package | npm |
| --- | --- |
| `pi-all-search` | `npm:pi-all-search` |
| `pi-all-tools` | `npm:pi-all-tools` |
| `pi-atuin` | `npm:pi-atuin` |
| `pi-cloudflare-browser-run` | `npm:pi-cloudflare-browser-run` |
| `pi-codebuddy-sdk` | `npm:pi-codebuddy-sdk` |
| `pi-dejavu-memory` | `npm:pi-dejavu-memory` |
| `pi-gemini-multimodal` | `npm:pi-gemini-multimodal` |
| `pi-shannon-statusline` | `npm:pi-shannon-statusline` |

Release a package by pushing a tag named `<package>-v<version>`, for example
`pi-atuin-v0.1.18`. The publish workflow builds and publishes only that package.
