# draftToMD

> Convert draft-js input to Markdown

# Usage

`npm install draft-to-md --save-dev`

```javascript
import Convert from 'draft-to-md';

class MarkdownExample extends React.Component {
    constructor(props) {
        super(props);

        const compositeDecorator = new CompositeDecorator([
            {
                strategy: hashtagStrategy,
                component: HashtagSpan,
            }
        ]);
        let text = "# Markdown\n1. convert **markdown** to `draft-js`\n2. convert `draft-js` to **markdown**"
        this.state = {
            editorState: EditorState.createWithContent(ContentState.createFromText(text))
        };
    };
    componentDidMount () {
        this.setMarkdown();
    };
    getMarkdown() {
        const content = this.state.editorState.getCurrentContent();
        return Convert.draftToMD(convertToRaw(content).blocks);
    };
    setMarkdown() {
        Convert.MDToDraft(this.state.editorState, this);
    };
    [...]
}
```
