# Value-backed Accessors v1: Basic value-backed accessors

> [!NOTE]
> All syntax and concepts are implicitly "to be bikeshedded". They are included to sketch ideas, not as concrete proposals.

This document explores a potential MVP design for the proposal, focused around the first problem statement, i.e. making it possible for authors to define value-backed accessors with DX comparable to that of class fields.

Then, [v2](design-v2.md) and later versions explore syntax extensions that address the second problem statement, i.e. expanding the syntax to facilitate other common value-backed accessor use cases.

## Detailed design

The minimal syntax to express intent for these use cases would be:

1. The property name
2. Any initial value

### Translation to existing primitives

There are two possible ways to implement this, each with its own pros and cons:
1. This is purely **sugar** over existing accessor infrastructure.
The syntax uses the initial value as input and generates a regular accessor.
2. This lifts the restriction that **accessors and value properties are mutually exclusive**: value-backed accessors are actually *both*.

The latter is a very elegant solution, as it *simplifies* the language by **lifting a restriction rather than adding a new primitive**. It even comes with an automatic imperative form since `Object.defineProperty()` just works out of the box.

There is a bit downside though: allowing a property descriptor to have `get`/`set` AND `writable`/`value` could be **massively breaking** for existing code, which likely makes it a non-starter.

However, it would be helpful to *read* the actual value in a descriptor without having to call `get()`, and ideally, `writable` should still work.
It is an open question how to make this possible without breaking existing code.

### What stores the value?

The [auto-accessors proposal](https://github.com/tc39/proposal-grouped-and-auto-accessors) uses private fields to store the value.
This makes it hard to extend to objects (at least without [private declarations](https://github.com/tc39/proposal-private-declarations)) and introduces surprising conflicts as an author-created `#foo` can conflict with a `foo` auto-accessor because it implicitly creates a `#foo` property.

It seems that most use cases fall in one of these two categories:
1. The underlying value is never used outside accessor code and is an implementation detail
2. The underlying value is used outside accessor code and needs to point to a specific property

For 1, the value doesn't need to be exposed as a separate property at all — it could be stored in an internal slot, accessible only by the implementation.
For v2, accessors can be defined to take the internal value as an argument, rather than creating and exposing a separate property with it.

To avoid creating several internal slots, There could be a single data structure stored in an internal [[InternalValues]] slot with all internal values of all value-backed accessors.

We could later introduce a descriptor or some other way to specify or read this internal value, but there is no reason to do this before v2, as it's always the same as the public value.

### Syntax

Since accessors are available in both classes and object literals, value-backed accessors should also be available across both.

If no interception logic is desired ([v2](design-v2.md)), the syntax should look as close as possible to a class field (or a data property in an object literal), in the interest of paving the way from one to the other.

There are two options here:
1. Prepend with a keyword (e.g. `tobikeshed foo = 1`)
2. Prepend with a symbol (e.g. `@foo = 1`)

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

### Imperative syntax

This is TBD.

Since class members are typically defined declaratively, and `Object.defineProperty()` can already be wrapped in helpers, there is less motivation to provide an imperative syntax.

That said, if the design we go with is that the underlying value is stored in an internal slot, this is something that cannot be done any other way, and therefore it would be nice to be able to define imperatively.

Imperatively accessing the internal value via the descriptor should also be possible.
It is an open question how to make this possible without breaking existing code.
