# Alias accessors

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

	get role () {
		return this.#internals.role;
	}
	set role (value) {
		this.#internals.role = value;
	}
	get form () {
		return this.#internals.form;
	}
	get labels () {
		return this.#internals.labels;
	}
	get setFormValue () {
		return this.#internals.setFormValue;
	}
	// ...
}
```

or when implementing a [first-class protocol](https://github.com/tc39/proposal-first-class-protocols):

```js
class C implements Iterable {
	get forEach () {
		return this[Iterable.forEach];
	}
	get map () {
		return this[Iterable.map];
	}
	// ...
}
```

It gets even more tedious when the proxied properties have setters too.

## Design

Just like value-backed accessors, if no side effects or logic is desired, proxying another property should involve little additional syntax over the property name and a reference to the property (chain) holding the underlying value.
It could even be a separate type of value-backed accessor, taking a property reference instead of an initial value, e.g.:

```js
class C {
	somekeyword foo someseparator #foo.value;
}
```

This would be sugar for:

```js
class C {
	get foo () {
		return this.#foo.value;
	}
	set foo (value) {
		this.#foo.value = value;
	}
}
```

For certain separators, the property chain being proxied could be first, e.g.:

```js
class C {
	alias #foo.value as foo;
}
```

Though it does seem that putting the property name first would be more readable and consistent with other class members.

So the **syntax to be bikeshedded** is:
1. Keyword to prepend the definition. Ideas:
   - `alias`
   - `delegate`
   - `forward`
   - `derived`
   - `bind` Could be confused with the `bind` method
   - `proxy`: Could be confused with the `Proxy` constructor
2. Separator between the property name and the property chain being proxied. Ideas:
   - `=`: Could be confused with the assignment operator
   - `=>`: Could be confused with the arrow function operator, but also indicates a binding
   - `via`
   - `from`
   - `through`
   - `to`

For concreteness, we’ll use `alias`/`to` in the rest of this document.

These property chains are basically chains of <tt>[</tt> <tt>.</tt> <em>LiteralPropertyName</em> <tt>]</tt> <tt>|</tt> <em>ComputedPropertyName</em> <tt>]</tt>.
`this.` at the start is implicit.

### Read-only aliases

While by default both a setter and a getter would be added, [composable setters](composable-setters.md) could be used to make it read-only, either with silent rejection (DOM style) or loud rejection (JS style):

```js
class C {
	#foo = 1;
	alias #foo as foo;
	validate foo (value) {
		// or throw, for loud rejection
		return false;
	}
}
```

Do note however that if the property being proxied is read-only, the error would just propagate naturally:

```js
class MyElement extends HTMLElement {
	#internals = this.attachInternals();
	alias form to #internals.form;
	// ...
}
```

Here, setting `myElement.form` would produce an error anyway, since `ElementInternals.prototype.form` is read-only.
Therefore, there is no need to prevent writes explicitly unless we want to swallow them.
