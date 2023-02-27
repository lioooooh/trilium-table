/**
 * 插件： 目录插件 
 * 作者： 柒元 2022.05
 * 邮箱： lioooooh@163.com
 * 描述：
 * 基于 https://github.com/zadam/trilium/discussions/2799
 * 参考 https://github.com/antoniotejada/Trilium-TocWidget
 *
 * 我对样式做了修改，可能会看起来更好看些，样式参考了wolai的样式
 * 我调整了正则表达式的匹配，可以让从其他文档复制过来的有格式的标题文档，也能被获取到
 * 你可以通过识别目录上标题前有几条竖杠，来判断标题级别，
 * 本脚本是插件，需要添加 #widget 属性
 * 待优化：文章只读状态时，点目录不能跳转到具体段落
**/

//设置目录的模板
/**
<div id="divtoc" style="width: calc(100% - 10px); margin: 0px 5px;  contain: none; overflow:auto;  border-radius: 5px;  box-shadow: 0 0px 5px #999; color: #999; ">

    //设置样式把标题树底下的那三个按钮弄到顶上去
    <style>div#left-pane {position: relative; }</style>
    <style>.tree-settings-popup {top: 0px !important;}</style>
    
    //设置目录最上面，创建一个标题显示的位置
    <div id="titlenamebox"  style="padding: 0px; border-radius: 5px; background: #DDDDDD;">
        //设置标题的div，并添加点击标题展开和收起的样式和脚本
        <style>.toclistshow {display: block !important;}</style>
        <script>function showtoc() {  document.getElementById("toclist").classList.toggle("toclistshow");}</script>
        <div class="titlename" onclick="showtoc()"  style="font-weight: bold; padding: 6px;  box-shadow: 0 0px 5px #999;  background: #DDDDDD;  cursor:pointer; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; width:calc(100% - 10px);  position: absolute;"></div>
    </div>
    
    //在标题下一层加一个占位div，防止目录滚动时标题挡住最上面的目录内容
     <div class="titlenamediv"  style="height:40px;   background: #ffffff00;"></div>
    //设置目录内容div
    <span id= "toclist" class="toc" style=" display: none; width: 100%;   " ></span>
</div>
**/
//   titlenamebox  这个是标题
//   class="titlenamediv"  这是个占位符，目录被折叠后需要这个开支撑显示

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


/**
 * 下面一堆是抄的原插件，不知道是什么东西

 */
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
/** 微软翻译
 * 在给定索引的父级子项中查找标题节点。
 *
 * @param {Element} 父父节点以查找标题索引。
 * @param {uint} 标题索引 标题索引
 * @returns {Element|null} 具有给定索引的标题节点，则 null 不能为
 *发现（即格式错误，如嵌套标题等）
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
        
        //标题在 CKEditor 中显示为扁平的顶级子级,命名为“标题”的文档加上级别，例如“标题2”，“heading3”，“heading2”等，而不是嵌套的标题级别。
        //如果找到一个标题节点，递减标题索引，直到达到零
  
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

        // 标题在 DOM 中显示为扁平的顶级子级，命名为“H”加上级别，例如“H2”，“H3”，“H2”等，而不是嵌套的标题级别。
        //如果找到标题节点，请递减标题索引直到达到零
        
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
 */
/**
 * 返回活动选项卡的元素，其中包含包含 只读注释的 HTML。
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

    //  笔记的 html 位于以下层次结构中
    //    note-split data-ntx-id=XXXX
    //    ...
    //    note-detail-readonly-text component
    //      <styles>
    //      note-detail-readonly-text-content
    //        <html>
    //注意
    //1.只读文本元素不会被删除，但当只读切换而不重新加载，
    // 2.在非活动选项卡中还可以隐藏只读文本元素
    //3.非活动拆分中可以有更多可见的只读文本元素
 
    
    const activeNtxId = glob.appContext.tabManager.activeNtxId;
    const readOnlyTextElement = $(".note-split[data-ntx-id=" + activeNtxId + "] .note-detail-readonly-text-content");

    assert(readOnlyTextElement.length == 1,
        "Duplicated element found for " + readOnlyTextElement);

    return readOnlyTextElement[0];
}

function getActiveTabTextEditor(callback) {
    // Wrapper until this commit is available
    // https://github.com/zadam/trilium/commit/11578b1bc3dda7f29a91281ec28b5fe6f6c63fef
    // 包装器，直到此提交可用
    //  https://github.com/zadam/trilium/commit/11578b1bc3dda7f29a91281ec28b5fe6f6c63fef
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
        // 值越高，表示位置朝向底部/右侧
        return 100;
    }

    get parentWidget() {
        dbg("getParentWidget");
        return 'left-pane';
    }

    isEnabled() {
        dbg("isEnabled");
        return super.isEnabled()
            && this.note.type === 'text'
            && !this.note.hasLabel('noTocWidget');
    }
    //doRender()方法好像是给插件的显示的部分（即目录）添加内容的方法，有同学知道具体含义欢迎来教我一下，非常感谢
    doRender() {
        dbg("doRender");
        this.$widget = $(TEMPLATE);
        //给目录的传值
        this.$toc = this.$widget.find('.toc');
        //给目录的标题传值
        this.$titlename=this.$widget.find('.titlename');
        return this.$widget;
    }
    //下面应该是页面刷新或者改变时，就重新传参数，这样目录就得到了试试更新
    async refreshWithNote(note) {
        dbg("refreshWithNote");
        const { content } = await note.getNoteComplement();
        const toc = this.getToc(content);
        //执行获取标题
        const  titlename = this.getTitlename();
        //把titlename设置给$titlename的html中
        this.$titlename.html(titlename);
        //把toc设置给$toc的html中
        this.$toc.html(toc);
     }
        //定义获取标题的方法
     getTitlename(){
        return document.title;
      };
    

    
    /**
     * Builds a jquery table of contents.
     *
     * @param {String} html Note's html content
     * @returns {jquery} ordered list table of headings, nested by heading level
     *         with an onclick event that will cause the document to scroll to
     *         the desired position.
     */
    /**
     * 构建一个 jquery 目录。
     * @param {String} html Note 的 html 内容
     * @returns {jquery} 标题的有序列表，按标题级别嵌套带有 onclick 事件，该事件将导致文档滚动到所需位置。
     */
    getToc(html) {
        dbg("getToc");
        //html参数是接口返回的整个页面的内容
        //console.log(html);
        console.log("----------------------------------");
        //有时从其他笔记复制过来的文本，自带一些格式，这里用htmltext来转换一下，把各种style，还有h标签下的span都替换成空
        var htmltext=html.replace(/\sstyle=".*?"|<a.*?>|<\/a.*?>|<div.*?>|<\/div.*?>|<span.*?>|<\/span.*?>/ig,"")
        
        
        // Regular expression for headings <h1>...</h1> using non-greedy
        // matching and backreferences
        //标题的正则表达式<h1>...</h1>使用不贪婪 匹配和反向引用
         let reHeadingTags = /<h(\d+)>(.*?)<\/h(\d+)>/g;
        //上面的正则表达式用于匹配出所有的h标签
        //
        // Use jquery to build the table rather than html text, since it makes
        // it easier to set the onclick event that will be executed with the
        // right captured callback context
        //使用jquery而不是html文本来构建表，因为它可以更轻松地设置将使用正确捕获的回调上下文执行的onclick事件
        
        //这里原来用的是ol，我改成了没有自动序号的ul
        //let $toc = $("<ol>");
        let $toc = $("<ul style='border-left: 3px solid #0000000a;'>");
        
        // Note heading 2 is the first level Trilium makes available to the note
        // 笔记标题2是Trilium提供给笔记的第一级
        let curLevel = 2;
        let $ols = [$toc];
       
        for (let m = null, headingIndex = 0; ((m = reHeadingTags.exec(htmltext)) !== null);
            ++headingIndex) {
            //
            // Nest/unnest whatever necessary number of ordered lists
            // 嵌套/取消嵌套任何必要数量的有序列表
            let newLevel = m[1];
            let levelDelta = newLevel - curLevel;
            if (levelDelta > 0) {
                // Open as many lists as newLevel - curLevel
                //打开尽可能多的列表  数量等于 newLeve - curLevel
                for (let i = 0; i < levelDelta; ++i) {
                     //这里原来用的是ol，我改成了没有自动序号的ul,还加了一些样式
                    //let $ol = $("<ol>");
                    let $ol = $("<ul style='border-left: 3px solid #0000000a;'>");
                    $ols[$ols.length - 1].append($ol);
                    $ols.push($ol);
                }
            } else if (levelDelta < 0) {
                // Close as many lists as curLevel - newLevel 
                 //打开尽可能多的列表  数量等于 newLeve - curLevel
                for (let i = 0; i < -levelDelta; ++i) {
                    $ols.pop();
                }
            }
            curLevel = newLevel;
            //
            // Create the list item and setup the click callback
            // 创建列表项并设置单击回调
            //
            let $li = $('<li style="cursor:pointer; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;  padding:5px; border-left: 3px solid #0000000a;">' + m[2] + '</li>');
            // XXX Do this with CSS? How to inject CSS in doRender?
            //在这里加了关于目录显示样式的CSS，鼠标悬浮和离开时的样式
            $li.hover(function () {
                $(this).css({"background-color": "#cc70701a","color": "#cf5659" ,"border-left": "3px solid #cf5659" });
            }).mouseout(function () {
                $(this).css({"background-color": "#fff0","color": "#999", "border-left": "3px solid #0000000a"});
            });
            //点击跳转事件
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
                        // 如果 html 格式不正确或元素内有标题，则 headingNode 可能为空，只需忽略且不导航
                        //（请注意，TOC 呈现和其他 TOC 条目的导航也可能是错误的）
                        if (headingNode != null) {
                            // Scroll to the end of the note to guarantee the
                            // next scroll is a backwards scroll that places the
                            // caret at the top of the screen
                            // 滚动到笔记的末尾，以确保下一个滚动是将插入符号放在屏幕顶部的向后滚动
                            model.change(writer => {
                                writer.setSelection(root.getChild(root.childCount - 1), 0);
                            });
                            textEditor.editing.view.scrollToTheSelection();
                            // Backwards scroll to the heading
                            // 向后滚动到标题
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
