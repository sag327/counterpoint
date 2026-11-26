# Integrated three-world architecture review

Reviewed the handoff’s timing, interaction and acceptance requirements on 2026-11-26. The final independent Node suite run passed 47 entries. The focused integration probes executed the JavaScript emitted by the single-file builder in a Node VM. The VM supplied a deterministic clock, pointer events, DOM elements, audio nodes and Canvas calls. The visual suite also ran independently using native Canvas 2D.

| Probe | Result |
|---|---|
| Scene change during sound | At audio time 0.355 s, a pending old source due at 0.370 s was stopped at 0.355 s. A sounding tail faded through 0.367 s. The new run’s first note started at 0.355 s. |
| Ordered pointer samples | A coalesced stroke crossed Circulation L0 then L4. The two cut commands preserved that spatial order at the same 27.501 sim ms timestamp. Losing capture before release produced zero commands. A world change between pointerdown and pointerup produced zero commands in the new scene. |
| Keyboard entry points | Calling the native site-button activation handler with click detail zero submitted the selected stimulus. Visible named buttons expose world selection and cuts to keyboard activation. Physical keyboard traversal and assistive technology remain to be exercised in a browser. |
| Preferences | Malformed JSON, null, scalar values, invalid enums and wrong field types recovered to defaults. Mixed valid and invalid fields recovered independently. The exact gain limits 0 and 0.7 round-tripped through reads. Denied storage access left both reading and saving usable. |
| Music identity | Conduction and Duality join accepted captures to note identities from the same production assignment function used by the inspector. The suite covers all three palettes, recovery and event provenance. The ring uses the handoff’s balanced pitches. |
| Packaging | A temporary clean build produced a single HTML file with embedded styles and script. Static inspection found only the data-URI favicon as a resource attribute, with no fetch calls, XHR, WebSockets, dynamic imports or external stylesheet imports. |
| Accelerated soak | The host harness completed 20 synthetic minutes, with 5,076 notes scheduled across its exploratory runs and soak. The mixer recorded zero stale, duplicate or late schedules and peaked at 10 sources. Five remained live at the end of the soak, with 27 cached buffers. The final reset sequence completed without trapped errors. |

## Defects reproduced and retested

- Hiding the page while the Web Audio resume promise was pending allowed Begin or Resume to start the transport in the background. The final fresh-build probe also covered hide followed by return before the promise settled. Begin remained idle with zero events and an explicit Resume message. The existing run remained paused after the interrupted Resume.
- A null primary or backdrop Canvas 2D context previously threw during initialization or caused recurring drawing errors. Both failure injections now display the Canvas requirement, disable Begin and leave the animation loop unscheduled.
- With the Laboratory open, a scene change followed immediately by its single-impulse action could enter a faulted Circulation run with the former Conduction site S. The fresh-build probe now starts a running Circulation protocol at R0. Changing a dropdown to N and stimulating before the next frame now submits N.

The host results establish deterministic command, event and source ordering. Desktop file opening, static HTTP browser execution, live timing and alignment, mobile gestures, assistive technology behavior, live endurance and human listening remain unverified in this review.
