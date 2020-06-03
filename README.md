# Codepad
Online Defold compiler/interpreter. [Try it here](https://defold.com/codepad/) or host your own custom version.

# Installation
You can use the Codepad in your own project by adding this project as a [Defold library dependency](http://www.defold.com/manuals/libraries/). Open your game.project file and in the dependencies field under project add:

https://github.com/defold/codepad/archive/master.zip

Or point to the ZIP file of a [specific release](https://github.com/defold/codepad/releases).

# Usage
The Codepad can be used in two ways:

1. As a stand-alone webpage with a code editor, live preview and console
2. As an embedded example on another webpage where the source code is provided

When you use the Codepad on a stand-alone webpage you need to define one or more scenes to chose from. Each scene should be contained within a collection and expose one or more scripts that the user should be able to modify. The scene collections should be available to the Codepad via collection proxies.

When you use the Codepad embedded on a webpage you define a single scene and expose one or more scripts that should accept source code from the embedding page.

## game.project setup
In both the stand-alone and embedded version of the Code pad you need to use the Codepad HTML template (located in `codepad/template.html`) as HTML file in `game.project` in the `HTML5` section.

You also need to make sure to include the static HTML5 content (css, javascript and images) from the `codepad/bundle_resources/` folder. You do this by adding `/codepad/bundle_resources/` in the Bundle Resources field of `game.project` in the `Project` section.

## Expose modifiable scripts
The scripts that are modifiable from the Codepad can be both game object scripts and GUI scripts. A game object or GUI scene that wants to have a modifiable script must add the `codepad/go.script` or `codepad/gui.gui_script` respectively.

## Intialise and update the codepad
Before the Codepad is used it must be initialised with available scenes and modifiable scripts per scene.

	local codepad = require "codepad.codepad"

	local scenes = {
		{
			name = "My Scene",
			url = "#scene_proxy",
			scripts = {
				{
					url = "myscene:/go#go",
					name = "go.script",
					code = nil, -- string with default script
				}
			}
		}
	}

	function init(self)
		codepad.init(self, scenes)
	end

	function update(self, dt)
		codepad.update(self, dt)
	end

	function on_message(self, message_id, message, sender)
		codepad.on_message(self, message_id, message, sender)
	end

In the above example we define a single scene named "My Scene" with a proxy URL of "#scene_proxy" (relative to the running script). The scene has a single script named "go.script" and the script URL is "myscene:/go#go". The names should be descriptive and help the user of the Codepad to chose the right scene and script to edit.

You can also provide an additional property `code` per script to provide a string containing any code you wish to use as default for the script. If no `code` is provided then the Codepad will use a default script containing empty Defold lifecycle functions.


## Libraries
Codepad uses the following libraries:

* [FileSaver.js](https://github.com/eligrey/FileSaver.js)
* [JSZip](https://github.com/Stuk/jszip)
* [Keymaster](https://github.com/madrobby/keymaster)
* [LZ-String](https://github.com/pieroxy/lz-string)
* [Ace](https://github.com/ajaxorg/ace/)
* [split.js](https://github.com/nathancahill/split/)
	
