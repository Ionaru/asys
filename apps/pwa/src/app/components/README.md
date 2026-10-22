<!-- SPDX-License-Identifier: EUPL-1.2 -->

# Atomic Design for ASYS

Ref: [Atomic Design](https://atomicdesign.bradfrost.com)

The idea is to split components into five categories:

- Atoms (in `./atoms`)
- Molecules (in `./molecules`)
- Organisms (in `./organisms`)
- Templates (in `./templates`)
- Pages (in `../pages`)

The goal for this is to make the components more modular and reusable. This way, we can build more complex components by combining simpler ones.

Changes to common elements of the UI can be done in a single place, and it will reflect in all the components that use it.

The level of each component comes from the design system's level table (its README, section Atomic design). `docs/atomic-design-plan.md` says which components have moved so far and which pull request moves the rest. `node scripts/check-architecture.mts` checks the import rules below and runs in the `lint` CI job.

![Atomic Design example](https://atomicdesign.bradfrost.com/images/content/instagram-atomic.png)

## Atoms

Atoms are the foundational building blocks that comprise all our user interfaces. Elements that can’t be broken down any further without ceasing to be functional.

**Rule of Thumb**:

- Atoms must not import other atoms. The one exception is the Icon atom, which an atom may hold as part of its label, as the design system allows for an Icon inside a Button.
- An atom may be several files in one folder when together they are one design-system atom. The Input atom is `input.ts`, `input-box.ts` and `single-line.ts`.
- Atoms have no HTML file, and ideally only have a single line of HTML.
- Atoms may have a .css or .scss file for styling.
- Atoms should only interact through input and output bindings.
- Atoms should have very specific inputs, e.g. "taskTitle" instead of requesting the entire Task object.
- Atoms may perform logic on their input or output data.

## Molecules

Molecules are relatively simple groups of UI elements functioning together as a unit. For example, a form label, search input, and button can combine to create a search form molecule.

**Rule of Thumb**:

- Molecules may import atoms or other molecules.
- Molecules should only interact through input and output bindings.
- Molecules may request object inputs if the data is used in different Atoms.
- Molecules may perform logic on their input or output data.
- Molecules with template logic should be tested.

## Organisms

Organisms are relatively complex UI components composed of groups of molecules and/or atoms and/or other organisms. These organisms form distinct sections of an interface.

**Rule of Thumb**:

- Organisms may import atoms, molecules, or other organisms.
- Organisms should only interact through input and output bindings.
- Organisms may perform logic on their input or output data.
- Organisms with template logic should be tested.

## Templates

Templates are page-level objects that place components into a layout. Templates are usually specific to a particular page.

**Rule of Thumb**:

- Templates may import atoms, molecules, organisms.
- Templates should only interact through input and output bindings.
- Templates may perform logic on their input or output data.

## Pages

Pages are specific instances of templates that inject data and content into the template’s components.

**Rule of Thumb**:

- Pages may only import one template.
- Pages have no HTML file.
- Pages have no CSS file.
- Pages inject services and provide data to the template.

## Every level

- **Inputs and outputs.** Besides its input and output bindings, a component may take projected content and may expose public `focus…()` methods that move focus inside itself. It has no other imperative API.
- **Support code.** Helpers that several levels share, such as `activation.ts` and `field-control.ts`, live in `./support`. Every level may import them, and they import nothing from `components/`. A helper that one component owns stays in that component's folder.
- **Services.** No component injects a service from `core/`. The one exception is `organisms/swipe-actions`, which uses the `core/platform` seams `Motion`, `Haptics` and `theme`.
- **Upwards and sideways.** Nothing in `components/` imports from `pages/`, `features/` or `layout/`.
