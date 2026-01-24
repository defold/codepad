/*jshint esversion: 6 */

/**
 * Fetch the scene hierarchy JSON from the native extension and update UI.
 */
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

/**
 * Update native dump filter to limit data to the active scene.
 */
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

/**
 * Start the per-frame (every other frame) hierarchy polling loop.
 */
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

/**
 * Build a signature string for detecting hierarchy structure changes.
 */
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

/**
 * Escape a string for safe HTML insertion.
 */
function codepad_escape_html(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Index hierarchy nodes by a stable key path for quick lookup.
 */
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

/**
 * Build a DOM subtree for a hierarchy node.
 */
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

/**
 * Render the hierarchy tree and update selection.
 */
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

/**
 * Bind click handlers for expand/collapse and selection.
 */
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

/**
 * Select a node by key and show its properties.
 */
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

/**
 * Format a property value into a readable string.
 */
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

/**
 * Render or update the properties list for a selected node.
 */
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
