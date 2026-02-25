# Continent Generator — Vision & Emotional Core

This document exists to keep us anchored when the context window fills up with math.

## What We're Making

A tool for making worlds. Not simulations — worlds. The kind you look at and want to
know what lives in the mountains, who named that river, what happened at that coast.

The output should feel like a page from an old atlas. The kind of map that has weight.
Where the terrain suggests history without stating it. Where a viewer's eye finds a
path through — up the coast, into the valley, over the range — and their imagination
follows it into a story.

## The Aesthetic Target

USGS shaded relief maps. Specifically the cartographic tradition where:
- Light falls from the northwest, long shadows across ridges
- Land is the colour of dry earth and old grass — honest, not theatrical
- Water goes from pale shelf-blue at the coast to the dark of the deep
- The mountains are white not because they're snow but because they're high
- The whole thing reads as *tactile* — you feel the texture of the land

This is the idiom. Not photorealism. Not fantasy illustration. The quiet authority
of a map made by someone who surveyed that ground with their boots.

## The Narrative Principle

*Terrain that inspires stories grows from constraints, not freedom.*

Every feature on the map should be explicable. Not labeled — not "here be mountains" —
but *implied*. The range is where it is because two things collided. The low country
is where it is because things pulled apart. The coast is the shape it is because of
what the sea took and what the land kept.

The user doesn't need to know the geology. But the geology should be coherent enough
that the resulting shape *feels earned*. That's the difference between a random
heightmap and a world.

## The Architecture Principle

**Plates first. Everything flows from the plates.**

The old version generated a blob, then painted plates on top. Mountains appeared at
arbitrary Voronoi seams — the grid was visible in the soul of the terrain. The story
was disconnected from the shape.

The new version asks: what are the plates? What do they want? Where are they going?
The continent is what happens when they arrive. The coast is the boundary between
continental crust and oceanic. The mountains are where the collision was. The rifts
are where things are coming apart.

Narrative grows within constraints. The plates are the constraints. The terrain is
the story.

## What We're Not Making

- A geophysics simulator (accuracy serves the story, not the other way round)
- A game map generator (no biomes, no dungeons, no POIs — just terrain for now)
- A tool that requires expertise (seed + button → world)

## The Test

Look at the output. Does your eye move? Does it find something to be curious about?
Does the shape suggest something happened there — something geological, yes, but also
something *narrative*? A place you could set a story?

If yes: we're on track.
If the terrain looks like noise with bumps: we have more work to do.
