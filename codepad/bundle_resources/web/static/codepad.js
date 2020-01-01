/*jshint esversion: 6 */

var EditSession = undefined;
var editor = undefined;

// EditSessions per file
var codepad_sessions = [];

// file sources provided in URL
var codepad_shared_sources = [];

// all available scenes
var scenes = [];

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
      script.onreadystatechange = script.onload = function() {
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
        dynload(src, function() {
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
    var js_libs = ["https://cdnjs.cloudflare.com/ajax/libs/ace/1.2.9/ace.js",
    "https://cdnjs.cloudflare.com/ajax/libs/split.js/1.5.10/split.min.js"];

    dynload_multiple(js_libs, function() {
        console.log("editor loaded");

        EditSession = require("ace/edit_session").EditSession;
        editor = ace.edit("editor");
        editor.setTheme("ace/theme/tomorrow_night_eighties");
        //editor.session.setMode("ace/mode/lua");

        // Setup panel splitters
        Split(['#pane-editors', '#pane-canvas'], {
            direction: 'vertical',
            onDrag: function() { fix_canvas_size(); }
        });

        Split(['#pane-console', '#pane-editor'], {
            sizes: [30, 70]
        });

        if (callback) {
            callback();
        }
    });
}

/**
 * Load the Defold engine
 */
function codepad_load_engine(defold_archive_location_prefix, defold_archive_location_suffix, defold_binary_prefix) {
    console.log("codepad_load_engine", defold_archive_location_prefix, defold_archive_location_suffix, defold_binary_prefix);
    var extra_params = {
        archive_location_filter: function( path ) {
            return (defold_archive_location_prefix + path + defold_archive_location_suffix);
        },

        engine_arguments: ["--verify-graphics-calls=false"],

        splash_image: "splash_image.png",
        custom_heap_size: 268435456
    };

    var splash = document.getElementById("splash");
    Progress = {
        progress_id: "defold-progress",
        bar_id: "defold-progress-bar",
        label_id: "defold-progress-label",

        addProgress : function (canvas) {
            splash.innerHTML = '<div id="defold-progress-wrap"><div id="' + Progress.label_id + '"></div><div id="' + Progress.progress_id + '"><div id="' + Progress.bar_id + '" style="width: 0%;"></div></div></div>';
            Progress.bar = document.getElementById(Progress.bar_id);
            Progress.progress = document.getElementById(Progress.progress_id);
            Progress.label = document.getElementById(Progress.label_id);
        },

        updateProgress: function (percentage, text) {
            Progress.bar.style.width = percentage + "%";

            text = (typeof text === 'undefined') ? Math.round(percentage) + "%" : text;
            Progress.label.innerText = text;
        },

        removeProgress: function () {
            if (Progress.progress.parentElement !== null) {
                splash.remove();
            }
            fix_canvas_size();
        }
    };

    // Run engine
    Module.onRuntimeInitialized = function() {
        Module.runApp("canvas", extra_params);
    };

    Module.locateFile = function(path, scriptDirectory)
    {
        console.log("Module.locateFile", defold_binary_prefix);
        // dmengine*.wasm is hardcoded in the built JS loader for WASM,
        // we need to replace it here with the correct project name.
        if (path == "dmengine.wasm" || path == "dmengine_release.wasm" || path == "dmengine_headless.wasm") {
            path = defold_binary_prefix + ".wasm";
        }
        return scriptDirectory + path;
    };

    var engineJS = document.createElement('script');
    engineJS.type = 'text/javascript';
    if (Module.isWASMSupported) {
        engineJS.src = defold_binary_prefix + '_wasm.js';
    } else {
        engineJS.src = defold_binary_prefix + '_asm.js';
    }
    document.head.appendChild(engineJS);
    fix_canvas_size();
}


/**
 * Get the currently selected scene from the scene drop-down
 */
function codepad_get_scene() {
    var scenes_elem = document.getElementById("scene");
    return scenes_elem.options[scenes_elem.selectedIndex].value;
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
    for (var i = 0; i < scene.scripts.length; i++)
    {
        var radio_id = "file_" + (i+1);
        var src_data = scene.scripts[i].code;
        if (!src_data)
        {
            src_data = default_script;
        }
        if (codepad_shared_sources[i] !== undefined) {
            src_data = codepad_shared_sources[i];
        }
        var file_session = new EditSession(src_data);
        file_session.setMode("ace/mode/lua");
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
    for (var i = 0; i < scene.scripts.length; i++)
    {
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
    for (var i=0; i < scenes.length; i++)
    {
        var scene = scenes[i];
        if (scene.id == scene_id)
        {
            codepad_sessions = [];
            if (EditSession !== undefined) {
                codepad_create_edit_sessions(scene);
            } else {
                codepad_create_edit_sessions_from_shared_sources(scene);
            }
            break;
        }
    }
}

/**
 * Called by Defold when the codepad is ready for use. This will do two things:
 * 1. Check if this codepad was started from a link containing code or from scratch
 * 2. Show the initial/default scene
 */
function codepad_ready(scenes_json) {
    scenes = JSON.parse(unescape(scenes_json));
    var scenes_elem = document.getElementById("scene");
    for (var i=0; i < scenes.length; i++)
    {
        var option = document.createElement("option");
        option.value = scenes[i].id;
        option.text = scenes[i].name;
        scenes_elem.appendChild(option);
    }
    codepad_trigger_url_check();
    codepad_change_scene();
}

/**
 * Called when the user changed file tab. This will update the editor session with
 * new code.
 */
function codepad_change_file() {
    var file_tabs = document.getElementsByName('current_file');

    for (var i = 0, length = file_tabs.length; i < length; i++)
    {
        if (file_tabs[i].checked)
        {
            editor.setSession(codepad_sessions[i]);
            break;
        }
    }
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

function codepad_get_code(i) {
    if (codepad_sessions[i-1]) {
        if (EditSession !== undefined) {
            return codepad_sessions[i-1].getDocument().getValue();
        } else {
            return codepad_sessions[i-1];
        }
    }
    return "";
}

var deparam = function (querystring) {
    // remove any preceding url and split
    querystring = querystring.substring(querystring.indexOf('?')+1).split('&');
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
function codepad_share() {
    var share_url = "?c=" + codepad_get_scene();
    for (var i = 0; i < codepad_sessions.length; i++)
    {
        var compressed_code = LZString.compressToBase64(codepad_get_code(i+1));
        compressed_code = "&s" + (i+1) + "=" + compressed_code;
        share_url = share_url + compressed_code;
    }

    window.location.hash = share_url;
}

// read by Defold runtime
codepad_should_reload = false;
codepad_should_restart = false;
codepad_should_change_scene = true;


function codepad_is_embedded()
{
    try {
        return window.self !== window.top;
    } catch (e) {
        return true;
    }
}

function fix_canvas_size(event)
{
    var canvas = document.getElementById('canvas');
    if (codepad_is_embedded()) {
        canvas.width = document.body.offsetWidth;
        canvas.height = document.body.offsetHeight;
    } else {
        canvas.width  = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }
}

function codepad_init(locationPrefix, locationSuffix, binaryPrefix) {
    splash.onclick = undefined;
    codepad_load_engine(locationPrefix, locationSuffix, binaryPrefix);
}

function codepad_show_play_embed(locationPrefix, locationSuffix, binaryPrefix) {
    var splash = document.getElementById("splash");
    splash.onclick = function() {
        codepad_init(locationPrefix, locationSuffix, binaryPrefix);
    };
    splash.innerHTML = "<div>Run code</div>";
    document.body.classList += "embedded";
    var pane_editors = document.getElementById("pane-editors");
    pane_editors.remove();
}

function codepad_start(locationPrefix, locationSuffix, binaryPrefix) {
    window.onresize = fix_canvas_size;
    if (codepad_is_embedded()) {
        codepad_show_play_embed(locationPrefix, locationSuffix, binaryPrefix);
    } else {
        codepad_load_editor(function() {
            codepad_init(locationPrefix, locationSuffix, binaryPrefix);
        });
    }
}
