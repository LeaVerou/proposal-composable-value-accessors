# Composable Value-backed Accessors

## Status

**Stage:** 0

**Authors:** Lea Verou (@leaverou)

**Champions:** Lea Verou (@leaverou)

## Contents

1. [Status](#status)
2. [Introduction](#introduction)
3. [Motivation](#motivation)
   1. [1. No way to define data properties that are part of the class shape](#1-no-way-to-define-data-properties-that-are-part-of-the-class-shape)
   2. [2. Most accessor use cases are value-backed and currently need boilerplate](#2-most-accessor-use-cases-are-value-backed-and-currently-need-boilerplate)
   3. [Why solve them together?](#why-solve-them-together)
4. [Detailed design](#detailed-design)
   1. [1. Value-backed accessors](#1-value-backed-accessors)
   2. [2. Alias accessors](#2-alias-accessors)
   3. [3. Composable setters](#3-composable-setters)
5. [Relationship to other proposals](#relationship-to-other-proposals)
   1. [Grouped accessors and auto-accessors](#grouped-accessors-and-auto-accessors)
   2. [Decorators](#decorators)
   3. [First-class protocols](#first-class-protocols)
6. [FAQ](#faq)
   1. [Isn't it much slower to create an accessor for every public data property?](#isnt-it-much-slower-to-create-an-accessor-for-every-public-data-property)
   2. [Why not just use decorators?](#why-not-just-use-decorators)


## Introduction

This proposal explores ways to make it easier to define **_additive_ or _composable_ accessors**:
Rather than the mental model of replacing a property with arbitrary code that regular accessors are designed around,
composable accessors are **value-backed**: as a baseline they proxy another property (stored in an internal slot by default, or provided by another property), and any validation logic, transformations, side effects, etc. are **layered over that baseline**.

In addition to improving ergonomics for common accessor use cases, this also provides classes an alternative to class fields to define data properties that are part of their public API with comparable ergonomics.

While Stage 1 is primarily about the [problem statement](#motivation), just to make things a little more concrete, the current brainstorming around potential solutions is included in the [detailed design](#detailed-design) section.

## Motivation

This proposal addresses two separate problem statements:
1. Authors should be able to easily define **public data properties that are part of a class' public API** and are introspectable without creating instances, just like regular accessors are.
2. The vast majority of accessor use cases are **conceptually layered over a regular data property**, and today require repetitive boilerplate. Authors should be able to define these accessors with a better [signal-to-noise ratio](https://lea.verou.me/blog/2025/user-effort/#signal-to-noise).

While these problems seem orthogonal, we believe it would be overall better for the language to [solve them together](#why-solve-them-together).

### 1. No way to define data properties that are part of the class shape

The only declarative way classes can currently define public data properties is through **public class fields**.

This is problematic for a number of reasons:
- Class fields are not available until instance creation time, which means the class itself **cannot be introspected** for its full API shape which limits metaprogramming.
- Despite the presence of private class fields, **public class fields are regularly used for private or semi-private implementation details** for a variety of reasons (desire to use proxies, subclass access, mixin access, older code etc.) so there was no committee consensus that they could be exposed when this was [proposed](https://github.com/leaverou/proposal-class-field-introspection/).
- There is no way for **first-class protocols to require or provide data properties**, since class fields were ruled out for this purpose (see [proposal-first-class-protocols/#58](https://github.com/tc39/proposal-first-class-protocols/issues/58))
- It is common for a public data property to start as a class field and be later **converted to an accessor** as needs change (data normalization, validation etc). However, this introduces a small **compat risk**, as there are externally observable differences between the two.

In theory, authors could use accessors, but the DX of defining an accessor when all that is needed is a regular data property is atrocious.
Instead of `foo = 1` authors need something like:

```js
class C {
	#foo = 1;
	get foo () {
		return this.#foo;
	}
	set foo (v) {
		this.#foo = v;
	}
}
```

Given that classes often have numerous public fields, this is not manageable.

In the Nov 2025 plenary while there wasn't consensus that public class fields can be exposed as they often hold implementation details (this was a core reason [class field introspection](https://github.com/leaverou/proposal-class-field-introspection/) did not advance to Stage 1), there was generally **consensus** in the room that a way is needed for classes to be able to **declare which of their public data properties are actually public API**.

### 2. Most accessor use cases are value-backed and currently need boilerplate

The current mental model behind accessor syntax  is that they replace a property with entirely arbitrary code.
This makes complex things possible, but simple things are not easy.

The vast majority (possibly over 90%, though it's hard to prove) of accessor use cases are **additive**.
Their conceptual model is not entirely arbitrary logic,
but a **layering** of transformations, side effects, and access control **over a regular property** (public or private).

A big chunk of these are basically regular data properties plus additional logic before the property can be set. For example, to perform **data validation** and throw on or reject certain values:


```js
get foo() {
	return this._foo;
}
set foo(value) {
	if (isNaN(value)) {
		throw SomeError("foo should be numeric, got " + value);
		// or just return
	}

	this._foo = value;
}
```

Or, for **data normalization**, to allow properties to accept many value types but only store a predictable format:

```js
get foo() {
	return this._foo;
}
set foo(value) {
	// Accept strings too, but store numbers
	this._foo = Number(value);
}
```

In these cases, the actual underlying property is an implementation detail, and specifying it explicitly introduces unnecessary cognitive overhead.

In other cases (which may or may not be out of scope for this proposal), the accessor is proxying another property that is also accessed separately:

```js
get foo () {
	return this.#fooSignal.value;
}
set foo (value) {
	this.#fooSignal.value = value;
}
```

Some (not mutually exclusive) reasons for this are:
- **Encapsulation**: obscure the data source so it can be changed later
- **Ergonomics**: shorten frequently accessed property chains
- **Access control**: private properties with public getters

### Why solve them together?

Since **accessors are already part of the class shape**, a natural, maximally minimal design is to provide a way to define public accessors that function like regular data properties with DX comparable to that of class fields.

But if we piggyback on accessors and provide an easy shortcut for value-backed accessors, this opens up possibilities for fixing some of _their_ issues around additive use cases, feeding two birds with one scone.

While these problems seem orthogonal, **we believe they should be solved together**.
It can be argued that trying to address both with the same solution does somewhat constrain the solution space for each, but this is a good thing.
Given that they _can_ be solved together, introducing different primitives to solve them separately would unnecessarily clutter the language.

## Detailed design

Since Stage 1 is mainly about the problem statement, and any proposed solutions are strawmen to be bikeshedded, the current brainstorming around design & implementation is moved to separate documents, summarized below.

Eventually, these can be split into separate proposals.


> [!IMPORTANT]
> **Any syntax is shown for illustrative purposes only** and is not part of the proposal (yet).

### 1. [Value-backed accessors](ideas/value-backed-accessors.md)

A shortcut to define accessors that set data on an internal slot, sans the cognitive overhead of defining a separate property to hold the data.
Unlike class fields, they become part of the class shape, so they can be introspected just like regular accessors.
They _may_ look like this:

<table><thead><tr><th>Closest current syntax</th><th>Potential new syntax</th></tr></thead>
<tr valign="top"><td>

```js
class C {
  #foo = 1;
  get foo () { return this.#foo; }
  set foo (value) { this.#foo = value; }
}
```
</td><td>

```js
class C {
  property foo = 1;
}
```
</tr><tr valign="top"><td>

```js
let foo = Symbol("foo");
let obj = {
  [foo]: 1,
  get foo () { return this[foo];  }
  set foo (value) { this[foo] = value; }
}
```
</td><td>

```js
let obj = {
  property foo: 1,
}
```
</td></tr></table>

### 2. [Alias accessors](ideas/alias-accessors.md)

A shortcut to define accessors that proxy another property or property chain on the same object.
Essentially value-backed accessors where the property the value is stored in is customizable.
They _may_ look like this:

<table><thead><tr><th>Closest current syntax</th><th>Potential new syntax</th></tr></thead>
<tr valign="top"><td>

```js
class C {
  #foo = new Signal(1);
  get foo () { return this.#foo.value; }
  set foo (value) { this.#foo.value = value; }
}
```
</td><td>

```js
class C {
  #foo = new Signal(1);
  alias foo = #foo.value;
}
```
</tr><tr valign="top"><td>

```js
let foo = Symbol("foo");
let obj = {
  [foo]: new Signal(1),
  get bar () { return this[foo].value;  }
  set bar (value) { this[foo].value = value; }
}
```
</td><td>

```js
let foo = Symbol("foo");
let obj = {
  [foo]: new Signal(1),
  alias foo: [foo].value,
}
```
</td></tr></table>

### 3. [Composable setters](ideas/composable-setters.md)

A way to define side effects, transformations, validation, etc. that are layered over a regular accessor (of any type). _One_ possible syntax might be:

<table><thead><tr><th>Closest current syntax</th><th>Potential new syntax</th></tr></thead>
<tr valign="top"><td>

```js
class C {
  #foo = 0;

  get foo () {
    return this.#foo;
  }

  set foo (value) {
    if (!isNaN(value)) {
      return;
    }
    this.#foo = Number(value);
   }
}
```
</td><td>

```js
class C {
	property foo = 0;

	validate foo (value) {
		return !isNaN(value);
	}

	normalize foo (value) {
		return Number(value);
	}
}
```
</tr></table>

This particular syntax depends on the [grouped accessors](https://github.com/tc39/proposal-grouped-and-auto-accessors) proposal for improved ergonomics.

## Relationship to other proposals

### [Grouped accessors and auto-accessors](https://github.com/tc39/proposal-grouped-and-auto-accessors)

There is a small overlap between the two proposals when it comes to [value-backed accessors](ideas/value-backed-accessors.md), since auto-accessors also include a syntax for this, though implemented differently:

```js
class C {
	accessor foo = 1;
}
```

However, for basic value-backed accessors, **the mental model should be declaring a data property**, and accessors are an implementation detail that should not drive syntax.

Additionally, auto-accessors are based on **private fields**, which makes it hard to extend to objects (at least without [private declarations](https://github.com/tc39/proposal-private-declarations)).
They include syntax that indirectly references private fields, creating some **confusing error conditions**, e.g. you can't have a `#set` accessor on a `foo` property if you already have a `#foo` private member, even though nothing in the syntax references `#foo` explicitly:

```js
class C {
  #y;
  accessor y { get; #set; }; // error (collides with #y)
}
```

> [!NOTE]
> This has been reaised as an issue and is being discussed in [proposal-grouped-and-auto-accessors/#10](https://github.com/tc39/proposal-grouped-and-auto-accessors/issues/10)

Beyond that minimal shared core, the two proposals solve different problems and **compose nicely**, with each making the other stronger.

For example, **grouped accessors** can be used to group getters and setters together so that the property name does not need to be repeated, and decorators can be applied to the entire group at once:

```js
class C {
  accessor x {
    get() { ... } // equivalent to `get x() { ... }`
    set(value) { ... } // equivalent to `set x(value) { ... }`
  }
}
```

This is **complementary** to some of the possible designs for this proposal, which **depend on it** for reducing repetition of the property name (see [v2](ideas/composable-setters.md)).

Beyond that, its extended syntax focuses around access control, e.g. public getters with private setters, which is also orthogonal to this proposal.

By offloading the simple data property use cases to this proposal, this proposal can focus on their core use cases around eliminating repetition and facilitating access control.
Or perhaps, down the line, the two can be merged, as they do share the same broad problem statements.

### [Decorators](https://github.com/tc39/proposal-decorators)

A current limitation of decorators is that they cannot convert between class fields and accessors.
Meaning, this would not work:

```js
class C {
  @reactive foo = 1;
}
```

One of the core motivations of the auto-accessors proposal was to facilitate exactly some of these use cases, by allowing for patterns like:

```js
class C {
  @foobar accessor foo = 1;

  @foobar accessor bar {
    get() { ... }
    set(value) { ... }
  }
}
```

However, for plain data properties without additional logic, accessors are an implementation detail and should not be driving syntax.

Additionally, the auto-accessors proposal includes a lot of additional complexity around access control which is not necessary for these use cases.
This proposal defines simple value-backed accessors in a way that is more geared around the mental model of defining a data property, and can ship without any additional complexity.

Last, decoupling common accessor use cases into separate, composable first-class parts makes decorators more powerful as they can now get access to more granular information about the accessor they are decorating rather than just a big opaque setter (e.g. the underlying value, any validation logic, etc.) and make more informed decisions.

### [First-class protocols](https://github.com/tc39/proposal-first-class-protocols)

This proposal is highly related to first-class protocols, as it provides a way for them to require and provide data properties.

## FAQ

### Isn't it much slower to create an accessor for every public data property?

Per discussions with implementers, it appears that accessors that just proxy a data property **already have comparable performance**, at least for JIT-compiled code.

Presumably, once this feature is possible, it will also enable further optimizations for these cases.

### Why not just use decorators?

This highlights exactly why the two problem statements should be solved together.

A userland decorator could probably solve the second problem statement, though it would be somewhat awkward to specify the necessary logic.
But to solve the first problem, the syntax for defining these fields needs to be **ubiquitous**.
If authors need to pull in utilities and helpers to define the shape of their classes, the path of least resistance is to continue to just use class fields.

