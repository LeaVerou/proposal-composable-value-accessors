# Value-backed Accessors v3

> [!NOTE]
> All syntax and concepts are implicitly "to be bikeshedded". They are included to sketch ideas, not as concrete proposals.


[v1](design-v1.md) defines a syntax to create accessors that are backed by an internal value with DX similar to that of class fields and outlines the underlying implementation.
[v2](design-v2.md) explores adding support for setter logic, for side effects, transformations, validation, etc.

This document explores syntax extensions to facilitate additional common use cases around value-backed accessors, such as those proxying another property, and/or transforming its value before returning it.

> [!IMPORTANT]
> This document is still being heavily edited. Any ideas in it are in the realm of speculative ideas for future extensions, and not a core part of this proposal.

## Design

In the spirit of composable accessor syntax, it should be possible to specify these separately:
- `get()` transformations
- Data source, for properties proxying another property

### Can we reuse `get()`?

While it would require a dramatically different signature for `set()` to support [write side effects](design-v2.md), getters can support transformations with a very small extension: passing the underlying value as an argument.

Since regular accessors do not have an underlying value, this does not break consistency.

### Specifying another property to hold the underlying value

There are many use cases for this:
- Using a private property for classes
- Using a property of an internal object (e.g. for the delegation pattern)
- Obscuring the source of a property or providing better ergonomics by shortening long chains of property access

If no side effects or logic is desired, proxying another property should involve little additional syntax over the property name and a reference to the property chain.
It could even be a separate type of value-backed accessor, taking a property reference instead of an initial value, e.g.:

```js
class C {
	proxy foo = #foo.value;
}
```

### Are intercepted reads useful when the data source is internal?

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
