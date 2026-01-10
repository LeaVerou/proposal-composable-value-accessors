# Proxy accessors

> [!NOTE]
> All syntax and concepts are implicitly "to be bikeshedded". They are included to sketch ideas, not as concrete proposals.

[Value-backed accessors](value-backed-accessors.md) defines a syntax to create accessors that are backed by an internal value with DX similar to that of class fields and outlines the underlying implementation.
However, another common type of value-backed accessor is when the underlying value is not stored in an internal slot, but rather proxied from another property.

Some (not mutually exclusive) reasons for this are:
- **Encapsulation**: obscure the data source so it can be changed later
- **Ergonomics**: shorten frequently accessed property chains
- **Access control**: private properties with public getters or public setters with additional safeguards over a regular private property

## Additional Use cases

Beyond the use cases outlined in the [core motivation](README.md#most-accessor-use-cases-are-value-backed-and-currently-need-boilerplate) section, easy proxying of another property is a common use case of its own.

There are many cases where multiple properties need to be forwarded through another object, e.g. for delegation patterns:

```js
class MyElement extends HTMLElement {
	#internals = this.attachInternals();

	constructor() {
		super();
	}

	proxy form = this.#internals.form;
	proxy labels = this.#internals.labels;
	proxy setFormValue = this.#internals.setFormValue;
	// ...
}
```

or when implementing a first-class protocol:

```js
class C implements Iterable {
	proxy forEach = [Iterable.forEach];
	proxy map = [Iterable.map];
	// ...
}
```

## Design

Just like value-backed accessors, if no side effects or logic is desired, proxying another property should involve little additional syntax over the property name and a reference to the property (chain) holding the underlying value.
It could even be a separate type of value-backed accessor, taking a property reference instead of an initial value, e.g.:

```js
class C {
	proxy foo = #foo.value;
}
```

However, given that we may want to layer additional logic over the proxied property, `=` may not be appropriate.
Another idea is to use a keyword:

```js
class C {
	proxy #foo.value as foo;
}
```
