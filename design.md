# Value-backed Accessors: Detailed Design

> [!NOTE]
> All syntax and concepts are implicitly "to be bikeshedded". They are included to sketch ideas, not as concrete proposals.

## Detailed design

In terms of improving [signal-to-noise](https://lea.verou.me/blog/2025/user-effort/#signal-to-noise) for data accessor use cases, the minimal syntax to express intent for these use cases would be:

0. the property name *(the only mandatory parameter)*
1. Any initial value
2. Any `set` side effects/transformations
3. Any `get` transformations
4. The property source, if public/existing.

Notes:
- For an MVP that covers the class/FCP pain points, 0+1 are enough.
- 3 is mainly useful with 4. There is little utility[^1] in transforming an internal value if it cannot be accessed directly — just store the value that should be returned.

[^1]: The main use cases around having 3 without 4 are around cases where we want to store a robust value (e.g. an id) but combine it with ephemeral information when read (e.g. a human-readable label).
But conceptually, those are cases better suited to a separate property to hold the robust value anyway.

### Implementation

There are two possible ways to implement this, each with its own pros and cons:
1. This is purely **sugar** over existing accessor infrastructure.
The syntax uses 1-3 above as input and generates a regular accessor.
2. This lifts the restriction that **accessors and value properties are mutually exclusive**: value accessors are actually *both*.

On one hand, 2 is a very elegant solution that **simplifies** the language by lifting a restriction rather than adding a new primitive and has an automatic imperative form since `Object.defineProperty()` just works.

However, allowing a property descriptor to have `get`/`set` AND `writable`/`value` could be massively breaking and likely not workable for existing code.

Therefore, in the rest of this we’ll use the first design.

### Syntax

#### Simple public data properties

Since accessors are available in both classes and object literals, value accessors should also be available across both.

If no interception logic is desired, the syntax should look as close as possible to a class field (or a data property in an object literal), in the interest of paving the way from one to the other.

There are two options here:
1. Prepend with a keyword (`tobikeshed foo = 1`)
2. Prepend with a symbol (`@foo = 1`)

The former is advantageous because:
1. A well-chosen keyword can be self-documenting and is easier to look up
2. It works with all possible ways to specify property names, including computed names (`["foo"]`, `[Symbol("foo")]`, private names, and any future extensions

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
- `accessor`: In the no-logic case, the mental model should be declaring a data property, and accessors are an implementation detail that should not drive syntax. Additionally, they are not a word that most JS authors are familiar with.

Until this is bikeshedded we’ll use `property` for clarity.

### Intercepted reads/writes

**It should not require refactoring to add side effects.**
Since the purpose of the extended syntax is to better support **additive** use cases, it should support incremental expansion from the basic syntax.
IOW, the syntax to specify the property name and initial value should be the same in both cases.


🚫 For example, this would be an **antipattern:**

```js
class A {
	// Simple syntax
	property foo = 1;

	// Syntax to add side effects
	property foo {
		value = 1;
		set (v) {
			return Number(v);
		}
	}
}
```

Adding side effects means we need to use a completely different syntax to specify the initial value.

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

which would rule out solutions that incorporate the initial value as part of the getter, such as:

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



### Are intercepted reads useful?

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

