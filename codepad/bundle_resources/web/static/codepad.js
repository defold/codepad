/*jshint esversion: 6 */

var EditSession = undefined;
var UndoManager = undefined;
var editor = undefined;

// EditSessions per file
var codepad_sessions = [];

// file sources provided in URL
var codepad_shared_sources = [];

// all available scenes
var scenes = [];

var project_info = {};
var engine_info = {};
var scene_hierarchy = null;
var scene_node_index = {};
var scene_selected_path = null;
var scene_structure_signature = null;
var scene_dump_running = false;
var scene_dump_frame = 0;
var scene_dump_missing_warned = false;
var scene_dump_filter = null;

var default_script = `function init(self)

end

function final(self)

end

function update(self, dt)

end

function on_message(self, message_id, message, sender)

end

function on_input(self, action_id, action)

end

function on_reload(self)

end`;

function dynload(src, callback) {
    var script = document.createElement('script'), loaded;
    script.setAttribute('src', src);
    if (callback) {
        script.onreadystatechange = script.onload = function () {
            if (!loaded) {
                callback();
            }
            loaded = true;
        };
    }
    document.getElementsByTagName('head')[0].appendChild(script);
}

function dynload_multiple(sources, final_callback) {
    var src = sources.pop();
    if (src !== undefined) {
        console.log("loading: " + src);
        dynload(src, function () {
            dynload_multiple(sources, final_callback);
        });
    } else {
        if (final_callback) {
            final_callback();
        }
    }
}

/**
 * Load the code editor from CDN and set up editor panes
 */
function codepad_load_editor(callback) {
    console.log("loading editor...");
    var js_libs = [
        "https://cdnjs.cloudflare.com/ajax/libs/ace/1.4.7/ace.js",
        "https://cdnjs.cloudflare.com/ajax/libs/split.js/1.5.11/split.min.js"];

    dynload_multiple(js_libs, function () {
        console.log("editor loaded");

        EditSession = require("ace/edit_session").EditSession;
        UndoManager = require("ace/undomanager").UndoManager;
        editor = ace.edit("editor");
        editor.setTheme("ace/theme/tomorrow_night_eighties");
        //editor.session.setMode("ace/mode/lua");

        // Setup panel splitters
        if (document.getElementById("row-top") && document.getElementById("row-bottom")) {
            Split(['#row-top', '#row-bottom'], {
                direction: 'vertical',
                sizes: [55, 45],
                minSize: [160, 160],
                onDrag: function () { fix_canvas_size(); }
            });
        }

        if (document.getElementById("pane-console") && document.getElementById("pane-editor")) {
            Split(['#pane-console', '#pane-editor'], {
                direction: 'horizontal',
                sizes: [30, 70],
                minSize: [180, 320]
            });
        }

        if (document.getElementById("inspector-pane") && document.getElementById("pane-canvas")) {
            Split(['#inspector-pane', '#pane-canvas'], {
                direction: 'horizontal',
                sizes: [30, 70],
                minSize: [180, 320],
                onDrag: function () { fix_canvas_size(); }
            });
        }

        if (document.getElementById("hierarchy-pane") && document.getElementById("properties-pane")) {
            Split(['#hierarchy-pane', '#properties-pane'], {
                direction: 'vertical',
                sizes: [50, 50],
                minSize: [80, 80]
            });
        }

        if (callback) {
            callback();
        }
    });
}


/**
 * Get the currently selected scene from the scene drop-down
 */
function codepad_get_scene() {
    var scenes_elem = document.getElementById("scene");
    return scenes_elem.options[scenes_elem.selectedIndex].value;
}

function codepad_get_scene_object(scene_id) {
    for (var i = 0; i < scenes.length; i++) {
        var scene = scenes[i];
        if (scene.id == scene_id) {
            return scene
        }
    }
}

function codepad_get_scene_name(scene_id) {
    return codepad_get_scene_object(scene_id).name;
}

function codepad_get_scripts(scene_id) {
    return codepad_get_scene_object(scene_id).scripts;
}

/**
 * Create the editor session for a scene. This will create the file tabs.
 * This is called when changing scene.
 */
function codepad_create_edit_sessions(scene) {
    var files_div = document.getElementById("files");
    files_div.innerHTML = "";

    var script_icon = document.getElementById("icon-script");
    script_icon = script_icon.innerHTML;

    var new_buttons = "";
    for (var i = 0; i < scene.scripts.length; i++) {
        var radio_id = "file_" + (i + 1);
        var src_data = scene.scripts[i].code;
        if (!src_data) {
            src_data = default_script;
        }
        if (codepad_shared_sources[i] !== undefined) {
            src_data = codepad_shared_sources[i];
        }
        var file_session = new EditSession(src_data);
        file_session.setMode("ace/mode/lua");
        if (UndoManager) {
            file_session.setUndoManager(new UndoManager());
        }
        codepad_sessions[i] = file_session;
        var checked = "";
        if (i == 0) {
            checked = " checked";
            editor.setSession(file_session);
        }
        var new_file_button = '<input type="radio" onchange="codepad_change_file()" id="' + radio_id + '" name="current_file" value="' + radio_id + '"' + checked + '><label for="' + radio_id + '">' + script_icon + scene.scripts[i].name + '</label>';
        new_buttons = new_buttons + new_file_button;
    }
    files_div.innerHTML = new_buttons;
}

function codepad_create_edit_sessions_from_shared_sources(scene) {
    for (var i = 0; i < scene.scripts.length; i++) {
        codepad_sessions[i] = codepad_shared_sources[i];
    }
}

/**
 * Call this when the codepad should change scene. This usually gets triggered
 * by a change in the scene selection drop-down menu.
 * The function will do two main things:
 * 1. It will set the codepad_should_change_scene flag. This will be read by Defold
 * 2. Update the edit session with the code for the scene
 */
function codepad_change_scene() {
    codepad_should_change_scene = true;
    var scene_id = codepad_get_scene();
    for (var i = 0; i < scenes.length; i++) {
        var scene = scenes[i];
        if (scene.id == scene_id) {
            codepad_sessions = [];
            if (EditSession !== undefined) {
                codepad_create_edit_sessions(scene);
            } else {
                codepad_create_edit_sessions_from_shared_sources(scene);
            }
            break;
        }
    }
    scene_structure_signature = null;
    scene_selected_path = null;
    codepad_set_dump_filter();
}


// Set selected scene in the html drop down
function codepad_set_selected_scene(scene_id) {
    var scenes_elem = document.getElementById("scene");
    var scene_options = scenes_elem.options;
    for (var option, i = 0; option = scene_options[i]; i++) {
        if (option.value == scene_id) {
            scenes_elem.selectedIndex = i;
            break;
        }
    }
}

/**
 * Called by Defold when the codepad is ready for use. This will do two things:
 * 1. Check if this codepad was started from a link containing code or from scratch
 * 2. Show the initial/default scene
 */
function codepad_ready(scenes_json, project_json, engine_json) {
    scenes = JSON.parse(unescape(scenes_json));

    // create scene dropdown
    var scenes_elem = document.getElementById("scene");
    for (var i = 0; i < scenes.length; i++) {
        var option = document.createElement("option");
        option.value = scenes[i].id;
        option.text = scenes[i].name;
        scenes_elem.appendChild(option);
    }

    engine_info = JSON.parse(unescape(engine_json));
    project_info = JSON.parse(unescape(project_json));

    var version_string = "Defold " + engine_info.version + " (" + engine_info.version_sha1 + ")";
    document.getElementById("defold_version").innerHTML = version_string;

    codepad_trigger_url_check();
    codepad_change_scene();
    setTimeout(function () {
        codepad_dump_hierarchy(true);
        codepad_start_dump_loop();
    }, 0);
}

/**
 * Called when the user changed file tab. This will update the editor session with
 * new code.
 */
function codepad_change_file() {
    var file_tabs = document.getElementsByName('current_file');

    for (var i = 0, length = file_tabs.length; i < length; i++) {
        if (file_tabs[i].checked) {
            editor.setSession(codepad_sessions[i]);
            break;
        }
    }
}

function codepad_clear_console() {
    codepad_should_clear_console = true;
}

function codepad_update_console(text) {
    var console_elem = document.getElementById("console");
    if (console_elem) {
        console_elem.innerHTML = text;
        console_elem.scrollTop = console_elem.scrollHeight;
    }
}

function codepad_reload() {
    codepad_should_reload = true;
}

function codepad_restart() {
    codepad_should_restart = true;
}

function codepad_dump_hierarchy(silent) {
    if (typeof Module === "undefined" || !Module.ccall) {
        if (!scene_dump_missing_warned && !silent) {
            console.warn("Scene dump unavailable: Module.ccall is missing.");
            scene_dump_missing_warned = true;
        }
        return;
    }
    try {
        codepad_set_dump_filter();
        var ptr = Module.ccall("CodepadSceneDump_DumpJson", "number", [], []);
        if (!ptr) {
            if (!silent) {
                console.warn("Scene dump returned no data.");
            }
            return;
        }
        var json = Module.UTF8ToString(ptr);
        var data = JSON.parse(json);
        if (Array.isArray(data)) {
            data = { _synthetic: true, children: data, props: { id: codepad_get_scene() || "scene" } };
        }
        scene_hierarchy = data;
        codepad_index_hierarchy(data);
        var signature = codepad_build_structure_signature(data);
        var structure_changed = signature !== scene_structure_signature;
        scene_structure_signature = signature;
        if (structure_changed || !document.getElementById("hierarchy-tree") || !document.getElementById("hierarchy-tree").hasChildNodes()) {
            codepad_render_hierarchy(data);
        } else {
            codepad_render_properties(scene_node_index[scene_selected_path]);
        }
        if (!silent) {
            console.log("Scene hierarchy:", data);
        }
        return data;
    } catch (err) {
        console.error("Scene dump failed:", err);
    }
}

function codepad_set_dump_filter() {
    if (typeof Module === "undefined" || !Module.ccall) {
        return;
    }
    var scene_id = codepad_get_scene();
    if (!scene_id || scene_id === scene_dump_filter) {
        return;
    }
    Module.ccall("CodepadSceneDump_SetFilter", null, ["string"], [scene_id]);
    scene_dump_filter = scene_id;
}

function codepad_start_dump_loop() {
    if (scene_dump_running) {
        return;
    }
    scene_dump_running = true;
    function tick() {
        if (!scene_dump_running) {
            return;
        }
        scene_dump_frame += 1;
        if (scene_dump_frame % 2 === 0) {
            codepad_dump_hierarchy(true);
        }
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function codepad_build_structure_signature(node) {
    var parts = [];
    (function walk(current) {
        if (!current) {
            return;
        }
        if (current._synthetic) {
            if (current.children) {
                for (var i = 0; i < current.children.length; i++) {
                    walk(current.children[i]);
                }
            }
            return;
        }
        parts.push(current._key || "");
        parts.push((current.props && current.props.id) || current.id || current.name || "");
        parts.push(current.type || "");
        var count = current.children ? current.children.length : 0;
        parts.push(String(count));
        if (current.children) {
            for (var i = 0; i < current.children.length; i++) {
                walk(current.children[i]);
            }
        }
    })(node);
    return parts.join("|");
}
function codepad_escape_html(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function codepad_index_hierarchy(node) {
    scene_node_index = {};
    if (!node) {
        return;
    }
    (function walk(current, parentKey, index) {
        if (!current) {
            return;
        }
        if (current._synthetic) {
            if (current.children) {
                for (var i = 0; i < current.children.length; i++) {
                    walk(current.children[i], parentKey || "", i);
                }
            }
            return;
        }
        var id = (current.props && current.props.id) || current.id || current.name || "node";
        var key = (parentKey ? parentKey + "/" : "") + id;
        current._key = key;
        scene_node_index[key] = current;
        if (current.children) {
            for (var i = 0; i < current.children.length; i++) {
                walk(current.children[i], key, i);
            }
        }
    })(node, "", 0);
}

function codepad_build_tree_node(node) {
    var wrapper = document.createElement("div");
    var hasChildren = node.children && node.children.length;
    wrapper.className = "tree-node" + (hasChildren ? " is-expanded" : "");

    var item = document.createElement("div");
    item.className = "tree-item";
    item.dataset.key = node._key || "";

    var caret = document.createElement("span");
    caret.className = "tree-caret";
    if (!hasChildren) {
        caret.style.visibility = "hidden";
    }
    item.appendChild(caret);

    var label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = (node.props && node.props.id) || node.id || node.name || "(unnamed)";
    item.appendChild(label);

    if (node.type) {
        var meta = document.createElement("span");
        meta.className = "tree-meta";
        meta.textContent = node.type;
        item.appendChild(meta);
    }

    wrapper.appendChild(item);

    if (hasChildren) {
        var children = document.createElement("div");
        children.className = "tree-children";
        for (var i = 0; i < node.children.length; i++) {
            children.appendChild(codepad_build_tree_node(node.children[i]));
        }
        wrapper.appendChild(children);
    }

    return wrapper;
}

function codepad_render_hierarchy(tree) {
    var container = document.getElementById("hierarchy-tree");
    if (!container) {
        return;
    }
    container.innerHTML = "";
    if (!tree) {
        return;
    }
    if (tree._synthetic && tree.children) {
        for (var i = 0; i < tree.children.length; i++) {
            container.appendChild(codepad_build_tree_node(tree.children[i]));
        }
    } else {
        container.appendChild(codepad_build_tree_node(tree));
    }
    codepad_bind_hierarchy_events();
    if (scene_selected_path && scene_node_index[scene_selected_path]) {
        codepad_select_node(scene_selected_path);
    } else if (tree._synthetic && tree.children && tree.children.length && tree.children[0]._key) {
        codepad_select_node(tree.children[0]._key);
    } else if (tree._key) {
        codepad_select_node(tree._key);
    }
}

function codepad_bind_hierarchy_events() {
    var container = document.getElementById("hierarchy-tree");
    if (!container || container._codepadBound) {
        return;
    }
    container._codepadBound = true;
    container.addEventListener("click", function (event) {
        var caret = event.target.closest(".tree-caret");
        if (caret) {
            var nodeElem = caret.closest(".tree-node");
            if (nodeElem && nodeElem.classList.contains("is-expanded")) {
                nodeElem.classList.remove("is-expanded");
                nodeElem.classList.add("is-collapsed");
            } else if (nodeElem && nodeElem.classList.contains("is-collapsed")) {
                nodeElem.classList.remove("is-collapsed");
                nodeElem.classList.add("is-expanded");
            }
            event.stopPropagation();
            return;
        }
        var item = event.target.closest(".tree-item");
        if (!item) {
            return;
        }
        var key = item.dataset.key;
        if (!key) {
            return;
        }
        codepad_select_node(key);
    });
}

function codepad_select_node(key) {
    var container = document.getElementById("hierarchy-tree");
    if (!container) {
        return;
    }
    var previous = container.querySelector(".tree-item.is-selected");
    if (previous) {
        previous.classList.remove("is-selected");
    }
    var next = container.querySelector('.tree-item[data-key="' + key + '"]');
    if (next) {
        next.classList.add("is-selected");
    }
    scene_selected_path = key;
    codepad_render_properties(scene_node_index[key]);
}

function codepad_format_prop_value(value) {
    if (value === null || value === undefined) {
        return "null";
    }
    if (Array.isArray(value)) {
        return "[" + value.map(codepad_format_prop_value).join(", ") + "]";
    }
    if (typeof value === "object") {
        try {
            return JSON.stringify(value);
        } catch (err) {
            return String(value);
        }
    }
    return String(value);
}

function codepad_render_properties(node) {
    var container = document.getElementById("properties-list");
    if (!container) {
        return;
    }
    if (!node) {
        container.innerHTML = "";
        container._codepadNodeKey = null;
        container._codepadKeySig = null;
        container._codepadValueEls = null;
        container._codepadRowEls = null;
        container._codepadHeaderEl = null;
        return;
    }

    var props = {};
    if (node.props) {
        for (var key in node.props) {
            if (node.props.hasOwnProperty(key)) {
                props[key] = node.props[key];
            }
        }
    }
    if (!props.id) {
        props.id = (node.props && node.props.id) || node.id || node.name || node._key || "node";
    }

    var priority = ["id", "name", "path", "url", "position", "rotation", "scale", "size", "pivot", "anchorPoint", "visible", "enabled", "layer"];
    var keys = Object.keys(props).sort();
    keys.sort(function (a, b) {
        var ai = priority.indexOf(a);
        var bi = priority.indexOf(b);
        if (ai === -1 && bi === -1) {
            return a.localeCompare(b);
        }
        if (ai === -1) {
            return 1;
        }
        if (bi === -1) {
            return -1;
        }
        return ai - bi;
    });

    var node_key = node._key || props.id || "node";
    container._codepadNodeKey = node_key;

    if (!container._codepadHeaderEl) {
        var header = document.createElement("div");
        header.className = "properties-header";
        container.appendChild(header);
        container._codepadHeaderEl = header;
    }
    container._codepadHeaderEl.textContent = props.id || "Node";

    if (!container._codepadRowEls) {
        container._codepadRowEls = {};
    }
    if (!container._codepadValueEls) {
        container._codepadValueEls = {};
    }

    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var row = container._codepadRowEls[key];
        var valueSpan = container._codepadValueEls[key];
        if (!row || !valueSpan) {
            row = document.createElement("div");
            row.className = "prop-row";

            var keySpan = document.createElement("span");
            keySpan.className = "prop-key";
            keySpan.textContent = key;

            valueSpan = document.createElement("span");
            valueSpan.className = "prop-value";

            row.appendChild(keySpan);
            row.appendChild(valueSpan);
            container.appendChild(row);

            container._codepadRowEls[key] = row;
            container._codepadValueEls[key] = valueSpan;
        }
        row.style.display = "grid";
        valueSpan.textContent = codepad_format_prop_value(props[key]);
    }

    for (var existing in container._codepadRowEls) {
        if (container._codepadRowEls.hasOwnProperty(existing)) {
            if (keys.indexOf(existing) === -1) {
                container._codepadRowEls[existing].style.display = "none";
            }
        }
    }
}

function codepad_get_code(i) {
    if (codepad_sessions[i - 1]) {
        if (EditSession !== undefined) {
            return codepad_sessions[i - 1].getDocument().getValue();
        } else {
            return codepad_sessions[i - 1];
        }
    }
    return "";
}

function deparam(querystring) {
    // remove any preceding url and split
    querystring = querystring.substring(querystring.indexOf('?') + 1).split('&');
    var params = {}, pair, d = decodeURIComponent;
    // march and parse
    for (var i = querystring.length - 1; i >= 0; i--) {
        pair = querystring[i].split('=');
        params[d(pair[0])] = d(pair[1] || '');
    }

    return params;
};

// handle url and shared data
function codepad_trigger_url_check() {
    var codepad_params = deparam(window.location.hash);
    if (codepad_params.c !== undefined) {

        // Change scene
        var scenes_elem = document.getElementById("scene");
        for (var i = 0; i < scenes_elem.options.length; i++) {
            if (scenes_elem.options[i].value == codepad_params.c) {
                scenes_elem.selectedIndex = i;
                break;
            }
        }

        for (var key in codepad_params) {
            if (codepad_params.hasOwnProperty(key)) {
                if (key.charAt(0) == 's') {
                    var src_index = key.substr(1);
                    src_index = parseInt(src_index);
                    codepad_shared_sources[src_index - 1] = LZString.decompressFromBase64(codepad_params[key]);
                }
            }
        }
    }
}

/**
 * Called when the user has chosen to share the current codepad contents. This
 * will update the browser URL to contain the full contents of the codepad for
 * easy sharing.
 */
function codepad_copy_to_clipboard(text, on_done) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
            .then(function () { on_done(true); })
            .catch(function () { codepad_copy_to_clipboard_fallback(text, on_done); });
        return;
    }
    codepad_copy_to_clipboard_fallback(text, on_done);
}

function codepad_copy_to_clipboard_fallback(text, on_done) {
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";
    document.body.appendChild(textarea);
    textarea.select();
    var copied = false;
    try {
        copied = document.execCommand("copy");
    } catch (e) {
        copied = false;
    }
    document.body.removeChild(textarea);
    on_done(copied);
}

function codepad_flash_share_copied() {
    var button = document.getElementById("codepad_share_button");
    if (!button) {
        return;
    }
    var label = button.querySelector(".label");
    if (label) {
        if (!button.dataset.defaultLabel) {
            button.dataset.defaultLabel = label.textContent;
        }
        label.textContent = "Copied!";
    } else {
        if (!button.dataset.defaultLabel) {
            button.dataset.defaultLabel = button.textContent;
        }
        button.textContent = "Copied!";
    }
    if (button._codepadResetTimer) {
        clearTimeout(button._codepadResetTimer);
    }
    button._codepadResetTimer = setTimeout(function () {
        var defaultLabel = button.dataset.defaultLabel || "Share";
        var restoreLabel = button.querySelector(".label");
        if (restoreLabel) {
            restoreLabel.textContent = defaultLabel;
        } else {
            button.textContent = defaultLabel;
        }
        button._codepadResetTimer = null;
    }, 1000);
}

function codepad_share() {
    var share_url = "?c=" + codepad_get_scene();
    for (var i = 0; i < codepad_sessions.length; i++) {
        var compressed_code = LZString.compressToBase64(codepad_get_code(i + 1));
        compressed_code = "&s" + (i + 1) + "=" + compressed_code;
        share_url = share_url + compressed_code;
    }

    window.location.hash = share_url;
    var base_url = window.location.href.split('#')[0];
    var full_url = base_url + "#" + share_url;
    codepad_copy_to_clipboard(full_url, function (copied) {
        if (copied) {
            codepad_flash_share_copied();
        }
    });
}

/**
 * Called when the user has chosen to save the current codepad contents. This
 * will create a zip and start a download.
 */
function codepad_save() {
    var scene_id = codepad_get_scene();
    var scene_name = codepad_get_scene_name(scene_id);
    var scripts = codepad_get_scripts(scene_id);

    var zip_filename = scene_name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    var zip = new JSZip();
    var dir = zip.folder(zip_filename);
    for (var i = 0; i < scripts.length; i++) {
        var filename = scripts[i].name;
        var code = codepad_get_code(i + 1);
        dir.file(filename, code);
    }

    zip.generateAsync({ type: "blob" })
        .then(function (content) {
            saveAs(content, zip_filename);
        });
}

// read by Defold runtime
codepad_should_reload = false;
codepad_should_restart = false;
codepad_should_change_scene = true;
codepad_should_clear_console = false;


function codepad_is_embedded() {
    try {
        return window.self !== window.top;
    } catch (e) {
        return true;
    }
}

function fix_canvas_size(event) {
    var canvas = document.getElementById('canvas');
    if (!canvas) {
        return;
    }
    var container = document.getElementById("app-container") || canvas.parentElement;
    var rect = container ? container.getBoundingClientRect() : canvas.getBoundingClientRect();
    var width = rect.width;
    var height = rect.height;
    if (codepad_is_embedded()) {
        width = document.body.offsetWidth || width;
        height = document.body.offsetHeight || height;
    }
    if (width > 0 && height > 0) {
        var dpr = window.devicePixelRatio || 1;
        canvas.style.width = Math.round(width) + "px";
        canvas.style.height = Math.round(height) + "px";
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
    }
}

function codepad_loaded(callback) {
    var splash = document.getElementById("splash");
    splash.onclick = undefined;
    splash.remove();
    callback();
    fix_canvas_size();
}

function codepad_show_play_embed(callback) {
    var splash = document.getElementById("splash");
    splash.onclick = function () {
        codepad_loaded(callback);
    };
    splash.innerHTML = "<div>Run code</div>";
    document.body.classList += "embedded";
    var row_top = document.getElementById("row-top");
    if (row_top) {
        row_top.remove();
    }
    var inspector = document.getElementById("inspector-pane");
    if (inspector) {
        inspector.remove();
    }
}

function codepad_start(callback) {
    window.onresize = fix_canvas_size;
    if (codepad_is_embedded()) {
        codepad_show_play_embed(callback);
    } else {
        codepad_load_editor(function () {
            codepad_loaded(callback);
        });
    }
}
