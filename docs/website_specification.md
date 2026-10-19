# Website Plan for "SpiderCSS"

This is a plan for a website that aim to support the paper titled "SpiderCSS: Scalable Fault-Tolerant CSS State Preparation."
For reference /Users/boldi/PycharmProjects/spiderstate-paper/spiderstate.tex contains the entire technical manuscript.  
This website should be an auto-deployed github pages site so the source should be in docs.

The aims of the website are to
- promote the works developed in the paper
- support the explanation of the results of the paper through interactive visualisations
- be usable as a GUI to generate fault-tolerant circuits preparing CSS states


Thinking about the interactive nature of the website, one should be able to specify a CSS code through its:
- If it's the logical |0> or |+> state.
- stabilizers, inputted as:
  - binary H_x and H_z matrices, or
  - text-like stabilizers (e.g. IIIXXXX, IIZZIZZ, ...)
- distance.

One should also be able to pick from a list of pre-specified codes.
This is Phase 1.

==================================================

Then, for Phase 2 we want to find a good bipartite / RREF basis.
Here, there are two aims: (1) explain and (2) use as GUI.

When we want to explain the method, we should be able to see the steps as we:
1. (re-)generate a permutation
2. permute the rows of the matrix
3. perform Gaussian eliminations
4. un-permute the rows

From the final unpermuted matrix, we should see:
- the cost of the state preparation
- the bipartite ZX-diagram with idealized internal edges that corresponds to the matrix

When we want to generate a state, we should be able to set max_basis_tries, and the best matrix will be picked out of X many random trials from the above procedure.
In this library, row_optimize_matrix implements this.

==================================================

At this point, we have an appropriate matrix and a corresponding ZX-diagram. I want to have two options, potentially as buttons:
(a) [Show ZX-rewrites]: unidealize internal edges, then FE-unfuse spiders using the precomputed library.
This is the bit about the theory, but this is not how things are implemented in practice.
(b) [Show Pipeline]: shows how a circuit is extracted from the ZX-diagram. This is Phase 3.

==================================================

For Phase 3 we start with the initialized global data structures and find and perform Algorithm 1.
Here, we can start with a random ordering of the edges, or one can press either of the named heuristics to get a final structure.
I would want the diagraph and the graph displayed as they are being mutated, the "target" ZX-diagram and which of its edges have been added, and also a graph showing the backtracing.

==================================================

Phase 4 is circuit extraction. This is trickly because we tell the story of it via re-arranging the diagram, but in practice we do BFS and build a circuit.
I would rather aim to get the diagram rearranged so that the extraction looks like a direct extraction.
Should have the option to export as stim or qasm.

==================================================

Phase 5, optionally, if there are simulation data about the selected code, that should be displayed after circuit extraction. 
