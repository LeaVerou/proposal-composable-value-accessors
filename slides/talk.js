import "https://webplatform.design/talks/common/talk.js";

Prism.languages.javascript.keyword.push({
	pattern: /\bproperty\b/,
	// alias: "tobikeshed",
});
Prism.languages.javascript.keyword.push({
	pattern: /\balias\b/,
	// alias: "tobikeshed",
});
Prism.languages.javascript.keyword.push(/\baccessor\b/);


class FakeSlide extends HTMLElement {
	constructor() {
		super();
	}

	connectedCallback() {
		this.innerHTML = document.getElementById(this.getAttribute("for"))?.innerHTML;
	}
}

customElements.define("fake-slide", FakeSlide);
