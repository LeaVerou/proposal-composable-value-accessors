# Value Accessors

## Status 

Stage: **0**

Authors:
- Lea Verou (@leaverou)

Champions:
- Lea Verou (@leaverou)

## Contents

[toc]

## TL;DR

This proposal explores ways to make it easier to define accessors that are transparently backed by regular value properties with DX comparable to class fields.
The primary goal is to provide a way for authors to include data properties in a class' public API, as opposed to class fields which do not alter the class shape.
A secondary goal is to facilitate several common accessor use cases.

The current strawman syntax looks like this, but do read the [detailed design section](#detailed-design) for the many alternatives:

```js 
class A {
	data foo = 1;
	data bar = 2 {
		set (value) {
			return Number(value);
		}
	}
}
```

## Motivation

### Define data properties that are part of the class shape

The only way classes can currently define public data properties is public class fields.

This is problematic for a number of reasons:
- Class fields are not available until instance creation time, which means the class itself **cannot be introspected** for its full API shape which limits metaprogramming.
- Despite the presence of private class fields, **public class fields are regularly used for private or semi-private implementation details** for a variety of reasons (desire to use proxies, subclass access, mixin access, etc.). This was a core reason [class field introspection](https://github.com/leaverou/proposal-class-field-introspection/) did not advance to Stage 1.
- There is no way for first-class **protocols to require or provide data properties**, since class fields were ruled out for this purpose (see [proposal-first-class-protocols/#58](https://github.com/tc39/proposal-first-class-protocols/issues/58))
- It is common for a public data property to start as a class field and be later converted to an accessor as needs change (data validation etc). However, this introduces a **small compat risk**, as there are externally observable differences between the two.

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

In the Nov 2025 plenary there was generally **consensus that a way is needed for classes to be able to declare their public data properties**.

Since **accessors are already part of the class shape**, a natural, maximally minimal design is to provide a way to define public accessors that function like regular data properties with DX comparable to class fields.

### Data-backed accessors

The current mental model behind the design of accessors is that they replace a property with entirely arbitrary code.
This makes complex things possible, but simple things are not easy.

The vast majority of accessor use cases are **additive**.
Their conceptual model is not entirely arbitrary logic, 
but a layering of transformations, side effects, and access control over a regular property (public or private).

For example, often accessors are essentially **proxies over an otherwise public data property**, either for encapsulation (obscure the data source so it can be changed later) or ergonomics  (shorten frequently accessed property chains):

```js
get bar () {
	return this.foo.value;
}
set bar (value) {
	this.foo.value = value;
}
```

Or, they introduce side effects to property writes and the underlying data property is an implementation detail.
For example, **data normalization** to allow properties to accept many value types but only store a predictable format:

```js
get foo() {
	return this._foo;
}
set foo(value) {
	this._foo = normalizeFoo(value);
}
```

Or, to **validate writes** and throw or reject certain values:


```js
get foo() {
	return this._foo;
}
set foo(value) {
	if (!isValidFoo(value)) {
		throw SomeError("Invalid foo: " + value);
		// or just return
	}
	
	this._foo = value;
}
```

In these cases, using regular accessors is not simply poor for DX, bu also encourages underscore-prefixed pseudo-private properties (regular private properties are not always an option).

## Detailed design

> [!NOTE]
> All syntax and concepts are implicitly "to be bikeshedded". They are included to sketch ideas, not as concrete proposals.


In terms of improving [signal-to-noise](https://lea.verou.me/blog/2025/user-effort/#signal-to-noise) for data accessor use cases, the minimal syntax to express intent for these use cases would be the property name and optionally:
1. Any initial value
2. Any `set` side effects/transformations
3. Any `get` transformations
4. The property source, if public/existing.

It is also important to note that 3 is mainly useful together with 4. There is little utility in transforming an internal value if it cannot be accessed directly — just store the value that should be returned.
The main use cases around having 3 without 4 are around cases where we want to store a robust value (e.g. an id) but combine it with ephemeral information when read (e.g. a human-readable label).
But conceptually, those are cases better suited to a separate property to hold the robust value anyway.

### Implementation

There are two possible ways to implement this, each with its own pros and cons:
1. This is purely **sugar** over existing accessor infrastructure.
The syntax uses 1-3 above as input and generates a regular accessor. 
2. This lifts the restriction that **accessors and value properties are mutually exclusive**: value accessors are actually *both*. 

Some advantages of 2:
- By eliminating an error condition rather than adding a new primitive, the feature **simplifies the language instead of adding complexity**.
- It also lends itself nicely to an imperative syntax: `Object.defineProperty()` just works and needs nothing new.

The main drawback is the slight wart that `get/set` needs to have a different signature in that case. 

### Mental model

There are three possible mental models here:
1. This is a **shorthand** way to define common accessors
2. This is a **value property**, whose reads/writes can be intercepted (like a limited proxy trap)
3. This lifts the restriction that accessors and value properties are mutually exclusive, and allows defining properties that are **both**

Which one we pick affects what syntax we expose.

3 seems like the most fruitful approach: instead of defining a new primitive, this feature is about lifting a restriction, and thus, **simplifying the language** and eliminating error conditions.

It also lends itself nicely to an imperative syntax: `Object.defineProperty()` just works.

There are some differences between value-backed getters and setters vs regular ones:
| | Regular accessor | Value-backed |
|---|-------|--------|
| Getter signature | (No arguments) | Internal value
| Getter return value | Value being read | Value being read | 
| Setter signature | New value | New value, internal value, setter function | 
| Setter return value | Ignored | Value to set |

### Simple public data properties

Since accessors are available in both classes and object literals, value accessors should also be available across both.

If no interception logic is desired, the syntax should look as close as possible to a class field (or a data property in an object literal), in the interest of paving the way from one to the other.

There are two options here:
1. Prepend with a keyword (`tobikeshed foo = 1`)
2. Prepend with a symbol (`@foo = 1`)

The former is advantageous because:
1. A well-chosen keyword is more self-documenting, 
2. It facilitates computed names (`["foo"]`, `[Symbol("foo")]`, just like accessors

```js 
var obj = {
    tobikeshed foo: 1,
    bar: 2,
}

class A {
    tobikeshed foo = 1;
}
```

Some ideas for what the keyword could be:
- `data`: Concise, but a bit confusing in object literals (isn't everything data?). The proposal will use this from here onwards.
- `property`: Consistent with other parts of the language. Same issue with `data` (isn't everything a property?)
- `field`: Too technical?
- `public`: Makes it clear that this is part of the public API, but we don't use `public` for methods, so it's inconsistent. And it doesn't communicate that this is a property, not a function.
- `accessor`: In the no-logic case, the mental model should be declaring a data property, and accessors are an implementation detail that should not drive syntax.

### Public data properties with side effects

Interception syntax could be modeled after accessors (path of least resistance) or even proxy traps.

Ideally, the syntax should allow incremental expansion to intercept data access, customize behavior etc without having to transform the existing property declaration into a different syntax.

Meaning if the simple syntax is:

```js 
class A {
	data foo = 1;
}
```

and the with-setter syntax is:


```js 
class A {
	data foo {
		value = 1;
		set (v) {
			return Number(v);
		}
	}
}
```

…that's an antipattern, because we now need to use a completely different syntax to specify the initial value.
Ideally, we should be possible to transform the former to the latter by simply **adding syntax**, e.g. 

```js 
let obj = {
    data foo: 1 {
        set (value) {
			return Number(value);
		}
    },
};

class A {
    data foo = 1 {
        set (value) {
			return Number(value);
		}
    },
}
```

We also need to be able to **distinguish `undefined` as an explicit value** vs lack of an initial value.
Meaning this should work:

```js 
let a = new A();
a.foo; // 1
a.foo = undefined;
a.foo; // undefined, not 1
```

which would rule out solutions like:

```js 
class A {
    data foo {
		get (value = 1) {
			return value;
		}
		set (value) { /* elided */ }
    },
}
```
or

```js 
class A {
    data foo {
		get (value) {
			return value ?? 1;
		}
		set (value) { /* elided */ }
    },
}
```


### Intercept reads?

Unlike regular getters which take no parameters, data accessor getters take the internal value as a parameter and return the transformed value.
This can be useful for storing more robust values (e.g. ids) and returning more ephemeral presentational values on reads (e.g. labels):

```js 
class A {
    data foo = 1 {
		get (value) {
			return this.labels[value];
		}
        set (value) {
			if (value in this.labels) {
				return value;
			}
		}
    },
}
```

Another example could be dynamic composition of inherited values

```js 
class BaseElement {
	static property styles = ["base.css"];
}

class MySwitch extends BaseElement {
	static property styles = ["switch.css"] {
		get (value) {
			return [
				...(super.styles || []),
				...value,
			];
		}
	};
}
```

While we _could_ define `styles` as `[...(super.styles || []), "switch.css"]`, this would not be "live", whereas this is.

However, without a way to access the underlying data property directly, data accessor getters are of limited utility.

### Side effects *after* writes

So far, we have been assuming that all side effects occur *before* setting.
However, there are use cases for side effects *after* setting.


For example, from [tiny-signals](https://github.com/jsebrech/tiny-signals/blob/main/signals.js):

```js 
export class Signal extends EventTarget {
    #value;
    get value () { return this.#value; }
    set value (value) {
        if (this.#value === value) return;
        this.#value = value;
        this.dispatchEvent(new CustomEvent('change')); 
    }

    // elided
}
```

When these do not need to be synchronous, this can be simply done through `Promise.resolve().then(/* ... */)`, but how would it be done synchronously, as is needed for the `tiny-signals` use case?

Perhaps a `setter` function can be passed as an argument for these cases:

With value accessors, this could be just:
```js 
export class Signal extends EventTarget {
    property value {
		set value (value, oldValue, set) {
			if (oldValue === value) return;
			set(value);
			this.dispatchEvent(new CustomEvent('change')); 
		}
	}

    // elided
}
```



### Open questions

#### Should it be possible to access and/or customize the underlying data property? 

The current auto-accessors proposal uses private class fields to facilitate access to the underlying data slot, which limits the functionality to classes.
And because private properties are lexical, that also introduces the wart that implicitly created properties can clash with explicitly created ones.

While there are many cases where accessing the underlying data slot is useful, it seems better not to expose it:
- The opposite behavior is much easier to achieve that way (just an extra loc in a setter), whereas if exposed, there is no way to un-expose it, unless private fields are used, with the downsides of that
- If a specific property is desired to hold the underlying value, the cognitive overhead of using a regular accessor is much smaller
- More customization can always be made possible later 

> [!Important]
> 👉🏼 So in the rest of this, we will assume that **underlying internal values are not exposed on any public property** and are only passed to setters/getters via arguments.

#### Enumerable or not enumerable?

What should these be consistent with?
- Accessors on classes are **not enumerable** 
- Class fields are **enumerable**
- Accessors on object literals are **enumerable**

Consistency with regular accessors seems like the least surprising option, and provides better compat for when moving from data accessor to regular accessor (but worse when moving from class field to data accessor) 

> [!Important]
> 👉🏼 Same as regular accessors

#### Do we need private value accessors?

Private value accessors don't serve the primary problem statement, but could be useful as a nicer way to write certain accessors.

> [!Important]
> 👉🏼 Nice-to-have but not a syntax driver.



## Relationship to other proposals


### [Grouped accessors and auto-accessors](https://github.com/tc39/proposal-grouped-and-auto-accessors) 

This proposal solves some of the same problems, differently. 

- Focuses on grouping `set` and `get`
- Also introduces simple data auto-accessors 
- Uses a private slot for the value, which makes it hard to extend to objects, and creates unnecessary error conditions, e.g. you can't have a `foo` accessor and a `#foo` private member, which breaks the principle of least surprise, since the author did not create a `#foo` property
- A lot of complexity around private setters with public getters

Ideally down the line they will either be merged, or slimmed down to reduce overlap.

### Compat with existing Stage 1+ proposals

### [Decorators](https://github.com/tc39/proposal-decorators)

Value accessors should play well with decorators. 
One of the reasons part of the auto-accessors proposal was pulled into decorators was to facilitate exactly some of these use cases.
By bridging data properties and accessors, this proposal facilitates decorators that can convert one to the other.

### [First-class protocols](https://github.com/tc39/proposal-first-class-protocols)

Both requiring data properties, and providing data properties (that the host class can override).



## FAQ

### Isn't it much slower to create an accessor for every public data property?

Per discussions with implementers, it appears that accessors that just proxy a data property **already have comparable performance**, at least for JIT-compiled code.

Presumably, once this feature is possible, it will also enable further optimizations for these cases.