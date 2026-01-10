# Composable setters

## Motivation

There is a large class of use cases that are basically a data property + setter logic.
This includes side effects, transformations, validation, etc.

[Value-backed accessors](value-backed-accessors.md) explore a baseline syntax and implementation to facilitate easy specification of accessors that proxy an internal value, and
[Proxy accessors](proxy-accessors.md) explore easy specification of accessors that proxy another existing property or property chain.
The extensions in this document are designed to layer on top of these, but can technically be layered on top of regular accessors too.

> [!NOTE]
> All syntax and concepts are implicitly "to be bikeshedded". They are included to sketch ideas, not as concrete proposals.


## Use cases

As described in the [core motivation](README.md#most-accessor-use-cases-are-value-backed-and-currently-need-boilerplate),
use cases for setter logic mainly fall into these categories:
1. Data validation: reject certain writes (loudly or silently)
2. Data normalization: transform the value before setting
3. Side effects: perform actions before or after setting the value

While most of these are around running logic **before the property is set**, there are use cases that require running logic **after setting**.
Here is an example from [tiny-signals](https://github.com/jsebrech/tiny-signals/blob/main/signals.js):

```js
export class Signal extends EventTarget {
    #value;
    get value () { return this.#value; }
    set value (value) {
        if (equals(this.#value, value)) return;
        this.#value = value;
        this.dispatchEvent(new CustomEvent('change'));
    }

    // elided
}
```

In some use cases this could be accomplished by queuing a microtask before the write (e.g. through `Promise.resolve().then(/* ... */)` or `queueMicrotask()`) but this is no replacement for use cases requiring **synchronous side effects**, such as this one.

## Syntax brainstorming

Ideally, **the syntax also be composable**.
Meaning, it should be possible to add side effects to a value-backed accessor by simply *adding* syntax, without having to refactor how the basic property = value syntax works.
And while these additions were primarily motivated by value-backed accessors, layering validation/transformation logic over regular setters can also be useful, e.g. for separation of concerns.

A way to specify side effects in a composable way would be to use new types of syntax blocks, that are complementary to `get()`/`set()`.
Then, [grouped accessors](https://github.com/tc39/proposal-grouped-and-auto-accessors) could be used to group the two and **prevent repetition** of the property name.

For example, to run logic before a property is set, we could have a `normalize()`/`validate()`/`transform()`/`beforeSet()` (name TBB) block:

```js
class A {
    property foo = 1;
	normalize foo (value, oldValue) {
        return Number(value);
    }
}

let obj = {
    property foo: 1,
	normalize foo (value, oldValue) {
        return Number(value);
    },
}
```

One downside is that it's unclear **how to _prevent_ writes without throwing**.
There are use cases where some writes are rejected quietly, e.g. when the value is not meaningfully different and there is a cost to setting.
This is especially important when layering this over a regular setter, and you may want to avoid triggering it needlessly.

- One idea may be to return `undefined` in that case, but then how _do_ we set the value to `undefined` explicitly (second design principle)?
- Another idea may be to return `oldValue` explicitly, and if the return value is `===` the existing value, the write is rejected.
This is better, but now there is no way to trigger an underlying setter without changing the value.

Perhaps a better solution may be to **separate data validation and data transformation** so that this can be explicit:

```js
class C {
	property foo = 0;
	// Or check, etc
	validate foo (value, oldValue) {
		return !isNaN(value);
	}
	// Or transform, etc
	normalize foo (value, oldValue) {
		return Number(value);
	}
}
```

If `validate()` returns `false`, the write is silently aborted (it can throw if loud rejection is desired).
This has the additional side effect of improved readability.

### Post-write side effects

Post-write synchronous side effects can also be implemented via a separate block.
E.g. for the `tiny-signals` use case:

```js
export class Signal extends EventTarget {
    property value;
	validate value (value, oldValue) {
		return equals(oldValue, value);
	}
	// or after, postset, written, changed etc.
	finally value (value) {
		this.dispatchEvent(new CustomEvent('change'));
	}

    // elided
}
```

This also allows for **async post-write side effects**, while pre-write validation/transformation can only be synchronous.

If the old value is also passed to this hook, the `tiny-signals` use case can be implemented without the need for pre-write logic at all:

```js
class Signal extends EventTarget {
    property value;
	finally value (value, oldValue) {
		if (!equals(oldValue, value)) {
			this.dispatchEvent(new CustomEvent('change'));
		}
	}

    // elided
}
```

### Automatic upgrade to value-backed accessors

To improve DX and reduce error conditions, we could define that value-backed accessors are **automatically defined or upgraded** if any composable accessor blocks are encountered:
- If no property has been defined with that name, a value-backed accessor is automatically defined with the given name and an initial value of `undefined`.
- If a simple data property has been defined with that name (and is `configurable`), it is automatically upgraded to a value-backed accessor with the given name and its current value as an initial value.

Meaning, these two are equivalent:

<table><tr valign="top"><td>

```js
class C {
	property foo;
	normalize foo (value, oldValue) {
		return Number(value);
	}
}
```

</td><td>

```js
class C {
	normalize foo (value, oldValue) {
		return Number(value);
	}
}
```
</td></tr></table>

As well as these two:

<table><tr valign="top"><td>

```js
let obj = {
	foo: 1,
	normalize foo (value, oldValue) {
		return Number(value);
	},
}
```

</td><td>

```js
let obj = {
	property foo: 1,
	normalize foo (value, oldValue) {
		return Number(value);
	},
}
```
</td></tr></table>


### Alternative direction: Using `set()` with a different signature

Regular setters take the new value as an argument, and their return value is ignored.
A different potential design would be to reuse `set()` but with a different signature.
Setters of value-backed accessors would be **incremental**: they would take the existing value as an argument, and return the value to be set.

One potential syntax was suggested above:

```js
class A {
    property foo = 1 {
        set (value) {
			return Number(value);
		}
    },
}
```

Though this gets quite weird for object literals:

```js
let obj = {
    property foo: 1 {
        set (value) {
			return Number(value);
		}
    },
}
```

Another idea is to add the value at the end (a la [auto-accessors](https://github.com/tc39/proposal-grouped-and-auto-accessors)), but that seems less readable:

```js
class A {
    property foo = {
        set (value) {
			return Number(value);
		}
    } = 1,
}

let obj = {
    property foo: {
        set (value) {
			return Number(value);
		}
    }: 1,
};
```

It's not immediately clear how this syntax could work for post-write side effects.
One idea could be to pass a setter function as another argument.
E.g. the `tiny-signals` use case could be written as:

```js
class Signal extends EventTarget {
    property value {
		set (value, oldValue, setter) {
			if (equals(this.#value, value)) return;
			setter(value);
			this.dispatchEvent(new CustomEvent('change'));
		},
	};
}
```

But in that case, the only benefit over the regular accessor syntax is eliminating the cognitive overhead (and conflict potential) of picking another property to store the internal value.
It is unclear whether that benefit alone is worth the additional complexity, and perhaps these use cases are better left out of scope if we go that route.

This design has several downsides over the previous one:
- Inconsistency of `set()` across accessor types could be a footgun
- Less composable: cannot overlay side effects over a regular setter
- Unclear how to translate to syntax
- Unclear how to translate to `Object.defineProperty()` descriptors

Therefore, the rest of this proposal will focus on the previous design.
