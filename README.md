# draftToMD

> Convert draft-js input to Markdown

# Usage

```
import Convert from 'draft-to-md';

[...]

getMarkdown() {
  const content = this.state.editorState.getCurrentContent();
  return Convert.draftToMD(convertToRaw(content).blocks);
}
setMarkdown() {
    Convert.MDToDraft(this.state.editorState, this);
}
```
