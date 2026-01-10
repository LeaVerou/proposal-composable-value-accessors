# Value-backed Accessors v2: Write side effects

> [!NOTE]
> All syntax and concepts are implicitly "to be bikeshedded". They are included to sketch ideas, not as concrete proposals.


[v1](design-v1.md) defines a syntax to create accessors that are backed by an internal value with DX similar to that of class fields and outlines potntial ideas for the underlying implementation.

This document explores potential syntax extensions that facilitate common accessor use cases as an additive delta over that, instead of the mental model of replacing a property with arbitrary code that regular accessors use.

## Extensions to v1

There is a large class of use cases that are basically a data property + setter logic.
This includes side effects, transformations, validation, etc.
v2 focuses on facilitating these use cases with a syntax that is additive to v1.

There is a large (but smaller) class of use cases around **proxying another property** with or without **transforming its value on reads**.
Without the ability to access the underlying value separately, getters are of limited utility — one can simply perform the transformation on writes instead.
Therefore, additional extensions around that are explored separately, in [v3](design-v3.md), though some designs here do may getter side effects as well, when it would be _weird_ not to.

## Use cases

Use cases for setter logic mainly fall into these categories:
- Data validation
- Data normalization
- Side effects

In terms of timing, most are around running logic **before** setting,
but there are some that also require running logic **after** setting.

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

In some use cases this could be accomplished by queuing a microtask before the write (e.g. through `Promise.resolve().then(/* ... */)` or `queueMicrotask()`) but this is no replacement for use cases requiring synchronous side effects, such as this one.

## Design principles

These are rules of thumb for the design of the extended syntax, but not hard requirements.

### It should not require refactoring to customize behavior

Since the purpose of the extended syntax is to better support **additive** use cases, this should also be reflected in the syntax, which should support incremental expansion from the basic property=value syntax.

IOW, the syntax to specify the property name and initial value should be the same in both cases, rather than a completely separate syntactic form.

🚫 For example, this would be an **antipattern** wrt this design principle:

```js
class A {
	// Simple syntax
	property foo = 1;

	// With setter logic
	property foo {
		value = 1;
		set (v) {
			return Number(v);
		}
	}
}
```

Adding setter logic means we need to use a completely different syntax to specify the initial value.

Ideally, a syntax like this makes it possible to transform the former to the latter by simply **adding syntax**:

```js
class A {
    property foo = 1 {
        set (value) {
			return Number(value);
		}
    },
}
```

### It should be possible to distinguish `undefined` as an explicit value vs lack of an initial value

This should work:

```js
let a = new A();
a.foo; // 1
a.foo = undefined;
a.foo; // undefined, not 1
```

which would rule out solutions that incorporate the initial value as part of a getter, such as:

```js
class A {
    property foo {
		// 🚫 No way to distinguish undefined values from no value
		get (value = 1) {
			return value;
		}
		set (value) { /* elided */ }
    },

	property foo {
		get (value) {
			// 🚫 Same issue
			return value ?? 1;
		}
		set (value) { /* elided */ }
    },
}
```

## Syntax brainstorming

### Using `set()` with a different signature

Unlike regular setters which take the new value as an argument, and their return value is ignored, setters of value-backed accessors could be **incremental**: they take the existing value as an argument, and return the value to be set.

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

But in that case this is very close to the accessor version.
The only benefit is eliminating the cognitive overhead (and conflict potential) of picking another property to store the internal value.
It is unclear whether that benefit alone is worth the additional complexity, and perhaps these use cases are better left out of scope.

#### Separate descriptors / syntax blocks

A completely different idea would be to **not use `set()` at all**, and support adding pre-write logic to *any* property:

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

Potential names for this block: `normalize()`, `validate()`, `transform()`.

Then, [grouped accessors](https://github.com/tc39/proposal-grouped-and-auto-accessors) could be used to group the two and **prevent repetition** of the property name.

Pros:
- Avoids the wart of having two different signatures for `set()` depending on what type of accessor we have
- Naturally lends itself to an `Object.defineProperty()` descriptor
- Allows layering transformation/validation logic over regular setters too, for separation of concerns

Post-write synchronous side effects can also be implemented via a separate block, e.g. `finally()`.
E.g. for the `tiny-signals` use case:

```js
export class Signal extends EventTarget {
    property value;
	validate value (value, oldValue) {
		if (equals(oldValue, value)) return;
		return value;
	}
	finally value (value) {
		this.dispatchEvent(new CustomEvent('change'));
	}

    // elided
}
```

Potential names for this block: `finally()`, `after()`, `postSet()`.

This also allows for **async post-write side effects**, while pre-write validation/transformation can only be synchronous.

One downside is that it's unclear how to prevent writes without erroring (which the `tiny-signals` use case also needs).
The sketch above implies that returning `undefined` would be equivalent to not setting the value, but then how _do_ we set the value to `undefined` explicitly (second design principle)?

Perhaps it should return `oldValue` explicitly, and if the return value is `===` the existing value, the property is not set.

```js
class Signal extends EventTarget {
    property value;
	validate value (value, oldValue) {
		return equals(oldValue, value) ? oldValue : value;
	}
	finally value (value) {
		this.dispatchEvent(new CustomEvent('change'));
	}

    // elided
}
```

Or, we could pass the old value to `finally()` as an argument, in which case we may not need pre-write logic at all:

```js
class Signal extends EventTarget {
    property value;
	finally value (value, oldValue) {
		if (equals(oldValue, value)) return;
		this.dispatchEvent(new CustomEvent('change'));
	}

    // elided
}
```

Alternatively, we could even split the logic into two separate blocks, one for validation (which returns a boolean) and one for transformation:

```js
class Signal extends EventTarget {
    property value;
	validate value (value, oldValue) {
		return equals(oldValue, value);
	}
	finally value (value) {
		this.dispatchEvent(new CustomEvent('change'));
	}
}
```

Then, the cases requiring transformation logic would use a separate block:

```js
class C {
	property foo = 0;
	validate foo (value, oldValue) {
		return !isNaN(value);
	}
	normalize foo (value, oldValue) {
		return Number(value);
	}
}
```

Potential names for this block: `transform()`, `normalize()`.

To improve DX, we could define that value-backed accessors are **automatically defined or upgraded** if any of these blocks are encountered:
- If no property has been defined with that name, a value-backed accessor is automatically defined with the given name and an initial value of `undefined`.
- If a simple data property has been defined with that name, it is automatically upgraded to a value-backed accessor with the given name and its current value as an initial value.

Meaning, these two are equivalent:

```js
class C {
	property foo;
	normalize foo (value, oldValue) {
		return Number(value);
	}
}
```

```js
class C {
	normalize foo (value, oldValue) {
		return Number(value);
	}
}
```
