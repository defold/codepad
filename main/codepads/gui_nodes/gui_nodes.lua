local gui_script = [[function init(self)
	gui.animate(gui.get_node("box"), gui.PROP_POSITION, vmath.vector3(0), gui.EASING_INOUTQUAD, 2, 0, nil, gui.PLAYBACK_LOOP_PINGPONG)
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

end
]]

local go_script = [[function init(self)
	go.animate(".", "euler.z", go.PLAYBACK_LOOP_FORWARD, 359, go.EASING_LINEAR, 2)
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

end
]]

return {
	name = "Gui Nodes",
	url = "#cp_gui_nodes",
	grid = false,
	scripts = {
		{
			url = "cp_gui_nodes:/go#gui",
			name = "gui.gui_script",
			code = gui_script
		},
		{
			url = "cp_gui_nodes:/go#go",
			name = "go.script",
			code = go_script
		},
	}
}