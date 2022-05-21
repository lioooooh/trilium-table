/**
 * 目录插件 
 * 柒元 2022
 * 基于 https://github.com/zadam/trilium/discussions/2799
 * 参考https://github.com/antoniotejada/Trilium-TocWidget
 
 *我对样式做了修改，可能会看起来更优雅
 *我调整了正则表达式的匹配，可以让从其他文档复制过来的有格式的标题文档，也能被获取到
 */


const TEMPLATE = `<div id="divtoc" style="width: calc(100% - 10px); margin: 0px 5px;  contain: none; overflow:auto;  border-radius: 5px;  box-shadow: 0 0px 5px #999; color: #999; ">
    <style>div#left-pane {position: relative; }</style>
    <style>.tree-settings-popup {top: 0px !important;}</style>
    <div id="titlenamebox"  style="padding: 0px; border-radius: 5px; background: #DDDDDD;">
        <style>.toclistshow {display: block !important;}</style>
        <script>function showtoc() {  document.getElementById("toclist").classList.toggle("toclistshow");}</script>
        <div class="titlename" onclick="showtoc()"  style="font-weight: bold; padding: 6px;  box-shadow: 0 0px 5px #999;  background: #DDDDDD;  cursor:pointer; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; width:calc(100% - 10px);  position: absolute;"></div>
    </div>
    
    <div class="titlenamediv"  style="height:40px;   background: #ffffff00;"></div>
    
    <span id= "toclist" class="toc" style=" display: none; width: 100%;   " ></span>

</div>`;

//   titlenamebox  这个是标题显示
//   class="titlenamediv"  这是个占位符，目录被折叠后需要这个开支撑显示
// 
// 

const showDebug = (api.startNote.getAttribute("label", "debug") != null);
function dbg(s) {
    if (showDebug) {
        console.debug("TocWidget: " + s);
    }
}

function info(s) {
    console.info("TocWidget: " + s);
}

function warn(s) {
    console.warn("TocWidget: " + s);
}

function assert(e, msg) {
    console.assert(e, "TocWidget: " + msg);
}

function debugbreak() {
    debugger;
}

/**
 * Find a heading node in the parent's children given its index.
 *
 * @param {Element} parent Parent node to find a headingIndex'th in.
 * @param {uint} headingIndex Index for the heading
 * @returns {Element|null} Heading node with the given index, null couldn't be
 *          found (ie malformed like nested headings, etc)
 */
function findHeadingNodeByIndex(parent, headingIndex) {
    dbg("Finding headingIndex " + headingIndex + " in parent " + parent.name);
    let headingNode = null;
    for (let i = 0; i < parent.childCount; ++i) {
        let child = parent.getChild(i);

        dbg("Inspecting node: " + child.name +
            ", attrs: " + Array.from(child.getAttributes()) +
            ", path: " + child.getPath());

        // Headings appear as flattened top level children in the CKEditor
        // document named as "heading" plus the level, eg "heading2",
        // "heading3", "heading2", etc and not nested wrt the heading level. If
        // a heading node is found, decrement the headingIndex until zero is
        // reached
        if (child.name.startsWith("heading")) {
            if (headingIndex == 0) {
                dbg("Found heading node " + child.name);
                headingNode = child;
                break;
            }
            headingIndex--;
        }
    }

    return headingNode;
}

function findHeadingElementByIndex(parent, headingIndex) {
    dbg("Finding headingIndex " + headingIndex + " in parent " + parent.innerHTML);
    let headingElement = null;
    for (let i = 0; i < parent.children.length; ++i) {
        let child = parent.children[i];

        dbg("Inspecting node: " + child.innerHTML);

        // Headings appear as flattened top level children in the DOM named as
        // "H" plus the level, eg "H2", "H3", "H2", etc and not nested wrt the
        // heading level. If a heading node is found, decrement the headingIndex
        // until zero is reached
        if (child.tagName.match(/H\d+/) !== null) {
            if (headingIndex == 0) {
                dbg("Found heading element " + child.tagName);
                headingElement = child;
                break;
            }
            headingIndex--;
        }
    }
    return headingElement;
}

/**
 * Return the active tab's element containing the HTML element that contains
 * a readonly note's HTML.
 * 
 */
function getActiveTabReadOnlyTextElement() {
    // The note's html is in the following hierarchy
    //   note-split data-ntx-id=XXXX
    //    ...
    //    note-detail-readonly-text component
    //      <styles>
    //      note-detail-readonly-text-content
    //        <html>
    // Note
    // 1. the readonly text element is not removed but hidden when readonly is
    //    toggled without reloading,
    // 2. There can also be hidden readonly text elements in inactive tabs 
    // 3. There can be more visible readonly text elements in inactive splits

    const activeNtxId = glob.appContext.tabManager.activeNtxId;
    const readOnlyTextElement = $(".note-split[data-ntx-id=" + activeNtxId +
        "] .note-detail-readonly-text-content");

    assert(readOnlyTextElement.length == 1,
        "Duplicated element found for " + readOnlyTextElement);

    return readOnlyTextElement[0];
}

function getActiveTabTextEditor(callback) {
    // Wrapper until this commit is available
    // https://github.com/zadam/trilium/commit/11578b1bc3dda7f29a91281ec28b5fe6f6c63fef
    api.getActiveTabTextEditor(function (textEditor) {
        const textEditorNtxId = textEditor.sourceElement.parentElement.component.noteContext.ntxId;
        if (glob.appContext.tabManager.activeNtxId == textEditorNtxId) {
            callback(textEditor);
        }
    });
}

class TocWidget extends api.NoteContextAwareWidget {
    get position() {
        dbg("getPosition");
        // higher value means position towards the bottom/right
        return 100;
    }

    get parentWidget() {
        dbg("getParentWidget");
        return 'left-pane';
        // return 'center-pane';
    }

    isEnabled() {
        dbg("isEnabled");
        return super.isEnabled()
            && this.note.type === 'text'
            && !this.note.hasLabel('noTocWidget');
    }

    doRender() {
        dbg("doRender");
        this.$widget = $(TEMPLATE);
        this.$toc = this.$widget.find('.toc');
        //
        
        this.$titlename=this.$widget.find('.titlename');
        
        //
        return this.$widget;
    }

    async refreshWithNote(note) {
        dbg("refreshWithNote");
        const { content } = await note.getNoteComplement();
        const toc = this.getToc(content);
        //获取标题
        const  titlename = this.getTitlename();
        this.$titlename.html(titlename);
        //
        this.$toc.html(toc);
    }
    getTitlename(){
    return document.title;
    };
    
    /*
//获取页面标题
        const titlename=document.title;
        <div style='white-space: nowrap; text-overflow: ellipsis; overflow: hidden; padding-left:5px; font-weight: bolder;  position: absolute;  top: 0; '>"+ titlename +" </div>
*/
    
    /**
     * Builds a jquery table of contents.
     *
     * @param {String} html Note's html content
     * @returns {jquery} ordered list table of headings, nested by heading level
     *         with an onclick event that will cause the document to scroll to
     *         the desired position.
     */
    getToc(html) {
        dbg("getToc");
        //html参数是接口返回的整个页面的内容
        //console.log(html);
        console.log("----------------------------------");
        //这里用htmltext来转换一下，把各种style，还有h标签下的span都替换成空
        var htmltext=html.replace(/\sstyle=".*?"|<a.*?>|<\/a.*?>|<div.*?>|<\/div.*?>|<span.*?>|<\/span.*?>/ig,"")
        //console.log(htmltext);
        // Regular expression for headings <h1>...</h1> using non-greedy
        // matching and backreferences
         let reHeadingTags = /<h(\d+)>(.*?)<\/h(\d+)>/g;
        //上面的正则表达式用于匹配出所有的h标签
        //
        // Use jquery to build the table rather than html text, since it makes
        // it easier to set the onclick event that will be executed with the
        // right captured callback context
        //let $toc = $("<ol>");
        
        let $toc = $("<ul style='border-left: 3px solid #0000000a;'>");
        // Note heading 2 is the first level Trilium makes available to the note
        let curLevel = 2;
        let $ols = [$toc];
       
        for (let m = null, headingIndex = 0; ((m = reHeadingTags.exec(htmltext)) !== null);
            ++headingIndex) {
            //
            // Nest/unnest whatever necessary number of ordered lists
            //
            let newLevel = m[1];
            let levelDelta = newLevel - curLevel;
            if (levelDelta > 0) {
                // Open as many lists as newLevel - curLevel
                for (let i = 0; i < levelDelta; ++i) {
                    let $ol = $("<ul style='border-left: 3px solid #0000000a;'>");
                    //let $ol = $("<ol>");
                    
                    
                    $ols[$ols.length - 1].append($ol);
                    $ols.push($ol);
                }
            } else if (levelDelta < 0) {
                // Close as many lists as curLevel - newLevel 
                for (let i = 0; i < -levelDelta; ++i) {
                    $ols.pop();
                }
            }
            curLevel = newLevel;

            //
            // Create the list item and setup the click callback
            //
            let $li = $('<li style="cursor:pointer; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;  padding:5px; border-left: 3px solid #0000000a;">' + m[2] + '</li>');
            // XXX Do this with CSS? How to inject CSS in doRender?
            //在这里加了关于目录显示样式的CSS，
            $li.hover(function () {
                $(this).css({"background-color": "#cc70701a","color": "#cf5659" ,"border-left": "3px solid #cf5659" });
            }).mouseout(function () {
                $(this).css({"background-color": "#fff0","color": "#999", "border-left": "3px solid #0000000a"});
            });
            $li.on("click", function () {
                dbg("clicked");

                const note = api.getActiveTabNote();
                if (note.getAttribute("label", "readOnly") != null) {
                    let readonlyTextElement = getActiveTabReadOnlyTextElement();
                    let headingElement = findHeadingElementByIndex(readonlyTextElement, headingIndex);

                    if (headingElement != null) {
                        headingElement.scrollIntoView();
                    } else {
                        warn("Malformed HTML, unable to navigate, TOC rendering is probably wrong too.");
                    }
                } else {
                    getActiveTabTextEditor(textEditor => {
                        const model = textEditor.model;
                        const doc = model.document;
                        const root = doc.getRoot();

                        let headingNode = findHeadingNodeByIndex(root, headingIndex);

                        // headingNode could be null if the html was malformed or
                        // with headings inside elements, just ignore and don't
                        // navigate (note that the TOC rendering and other TOC
                        // entries' navigation could be wrong too)
                        if (headingNode != null) {
  

        

                            // Scroll to the end of the note to guarantee the
                            // next scroll is a backwards scroll that places the
                            // caret at the top of the screen
                            model.change(writer => {
                                writer.setSelection(root.getChild(root.childCount - 1), 0);
                            });
                            textEditor.editing.view.scrollToTheSelection();
                            // Backwards scroll to the heading
                            model.change(writer => {
                                writer.setSelection(headingNode, 0);
                            });
                            textEditor.editing.view.scrollToTheSelection();
                        } else {
                            warn("Malformed HTML, unable to navigate, TOC rendering is probably wrong too.");
                        }
                    });
                }
            });
            $ols[$ols.length - 1].append($li);
        }

        return $toc;
    }

    async entitiesReloadedEvent({ loadResults }) {
        dbg("entitiesReloadedEvent");
        if (loadResults.isNoteContentReloaded(this.noteId)) {
            this.refresh();
        }
    }
}

info("Creating TocWidget");
module.exports = new TocWidget();
