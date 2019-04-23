local rxi_json = require "codepad.utils.json"
local escape = require "codepad.utils.escape"

local codepad = {}

local is_error = false
local luastrsanitize = function (str)
	str=str:gsub("\\","\\\\")
	str=str:gsub("&","&amp;")
	str=str:gsub("'","&#39;")
	str=str:gsub("/","&#47;")
	str=str:gsub("<","&lt;")
	str=str:gsub(">","&gt;")
	str=str:gsub('"','&quot;')
	str=str:gsub("\n","<br>")
	return str
end

codepad.funcs = {}
codepad.scenes = {}
codepad.current_cp = nil

function codepad.url_to_hex(url)
	url = url or msg.url()
	return hash_to_hex(url.socket) .. hash_to_hex(url.path) .. hash_to_hex(url.fragment)
end

function codepad.register_script(id)
	local scene = codepad.scenes[codepad.current_cp]
	assert(scene)
	if id == hash("") then
		id = codepad.url_to_hex()
	else
		id = hash_to_hex(id)
	end
	for i,script in ipairs(scene.scripts) do
		if script.id == id then
			return i
		end
	end
	error("Unknown script! Did you forget to define it?")
end

-- initialise the codepad
-- @param scene List of scenes to chose from
function codepad.init(self, scenes)
	assert(html5, "You must run this from a browser")
	sys.set_error_handler(codepad.error_handler)

	-- validate scenes and store them (keyed on url)
	for i, scene in ipairs(scenes) do
		assert(scene.url, ("Scene #%d doesn't define a proxy url"):format(i))
		assert(scene.scripts, ("The scene %s doesn't define any scripts"):format(scene.url))
		scene.id = scene.url
		codepad.scenes[scene.url] = scene
		for i,script in pairs(scene.scripts) do
			assert(script.name, ("Script #%d doesn't have a name"):format(i))
			assert(script.url or script.id, ("Script %s doesn't define a url or id"):format(script.name))
			if script.url then
				script.id = codepad.url_to_hex(msg.url(script.url))
			else
				script.id = hash_to_hex(hash(script.id))
			end
		end
	end

	-- send scenes to html
	local scenes_json = rxi_json.encode(scenes)
	html5.run(("codepad_ready('%s')"):format(escape.escape(scenes_json)))

	local engine_info = sys.get_engine_info()
	html5.run(("document.getElementById('defold_version').innerHTML = 'Defold %s (%s)'"):format(engine_info.version, engine_info.version_sha1))
end


-- update codepad with any changes from the html5 page
function codepad.update(self, dt)
	if codepad.call_reload then
		codepad.call_reload = false
	end
	-- poll if we should reload
	if html5 then
		codepad.check_change_scene()
		codepad.check_should_reload()
		codepad.check_should_restart()
	end
	-- draw grid if enabled for the current scene
	if codepad.scenes[codepad.current_cp].grid then
		local grid_line_count = 100
		local grid_step = 50
		local color = vmath.vector4(0.3)
		local origo = vmath.vector4(0.5)
		for i=-grid_line_count,grid_line_count do
			-- x
			local cur_color = color
			if i == 0 then
				cur_color = origo
			end
			msg.post("@render:", "draw_line", { start_point = vmath.vector3(i*grid_step, -grid_line_count*grid_step, 0),
				end_point = vmath.vector3(i*grid_step, grid_line_count*grid_step, 0),
				color = cur_color
			})
			msg.post("@render:", "draw_line", { start_point = vmath.vector3(-grid_line_count*grid_step, i*grid_step, 0),
				end_point = vmath.vector3(grid_line_count*grid_step, i*grid_step, 0),
				color = cur_color
			})
		end
	end
end


function codepad.on_message(self, message_id, message, sender)
	if message_id == hash("proxy_loaded") then
		msg.post(sender, "enable")
	end
end

function codepad.check_change_scene()
	local should_change_scene = html5.run('codepad_should_change_scene')
	if should_change_scene == "true" then
		local scene = html5.run('codepad_get_scene()')
		codepad.restart(scene)
		html5.run('codepad_should_change_scene = false;')
	end
end

function codepad.check_should_reload()
	local should_reload = html5.run('codepad_should_reload')
	if should_reload == "true" then
		codepad.reload()
		html5.run('codepad_should_reload = false;')
	end
end

function codepad.check_should_restart()
	local should_restart = html5.run('codepad_should_restart')
	if should_restart == "true" then
		codepad.restart(codepad.current_cp)
		html5.run('codepad_should_restart = false;')
	end
end

function codepad.reload()
	print("Reloading...")
	codepad.get_external_code()
	codepad.call_reload = true
end

function codepad.restart(scene)
	print("Restarting...")
	-- unload current pad and async load the cp again
	if codepad.current_cp then
		msg.post(codepad.current_cp, "unload")
	end
	codepad.current_cp = scene
	codepad.get_external_code()
	msg.post(codepad.current_cp, "async_load")
end

function codepad.get_external_code()
	-- clear old code
	codepad.funcs = {}

	local code_snippet_count = #codepad.scenes[codepad.current_cp].scripts

	for i=1,code_snippet_count do

		codepad.funcs[i] = {
			init = nil,
			final = nil,
			update = nil,
			on_message = nil,
			on_input = nil,
			on_reload = nil
		}

		local new_code = html5.run("codepad_get_code(" .. i .. ")")
		new_code, err = loadstring(new_code, "=" .. tostring(codepad.scenes[codepad.current_cp].scripts[i].name))

		if not new_code then
			is_error = true
			print("Error while loading new code: " .. tostring(err))
			is_error = false
		else

			local temp_G = {}
			for k,v in pairs(_G) do
				temp_G[k] = v
			end
			setfenv(new_code, temp_G)
			new_code()
			codepad.funcs[i].init = temp_G.init
			temp_G.init = nil
			codepad.funcs[i].final = temp_G.final
			temp_G.final = nil
			codepad.funcs[i].update = temp_G.update
			temp_G.update = nil
			codepad.funcs[i].on_message = temp_G.on_message
			temp_G.on_message = nil
			codepad.funcs[i].on_input = temp_G.on_input
			temp_G.on_input = nil
			codepad.funcs[i].on_reload = temp_G.on_reload
			temp_G.on_reload = nil

			-- apply env to global env
			for k,v in pairs(temp_G) do
				_G[k] = v
			end

			if codepad.funcs[i].init then setfenv(codepad.funcs[i].init, _G) end
			if codepad.funcs[i].final then setfenv(codepad.funcs[i].final, _G) end
			if codepad.funcs[i].update then setfenv(codepad.funcs[i].update, _G) end
			if codepad.funcs[i].on_message then setfenv(codepad.funcs[i].on_message, _G) end
			if codepad.funcs[i].on_input then setfenv(codepad.funcs[i].on_input, _G) end
			if codepad.funcs[i].on_reload then setfenv(codepad.funcs[i].on_reload, _G) end
		end
	end
end

-- hack print
local ___print = print
local console_lines = {}
local console_max = 80
print = function(...)
	___print(...)

	if html5 then
		local input = {...}
		local line = ""
		--for _,v in pairs(input) do
		for i=1,#input do
			local v = input[i]
			local d = tostring(v)
			if v == nil then
				d = "nil"
			end
			line = line .. d .. "    "
		end
		if #input == 0 then
			line = "nil"
		end

		table.insert(console_lines, luastrsanitize(line))

		if is_error then
			console_lines[#console_lines] = '<span style=\\"color: #ff5e5d;\\">' .. console_lines[#console_lines] .. "</span>"
		end

		if #console_lines > console_max then
			local rem_lines = #console_lines - console_max
			for i=1,rem_lines do
				table.remove(console_lines, 1)
			end
		end

		local out = ""
		for _,v in ipairs(console_lines) do
			out = out .. v .. "<br>"
		end

		if html5 then
			html5.run('codepad_update_console("' .. out .. '")')
		end
	end
end

function codepad.error_handler(source, message, traceback)
	is_error = true
	print(message)
	print(traceback)
	is_error = false
end

return codepad
