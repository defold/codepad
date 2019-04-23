local factory_script = [[function init(self)
	msg.post(".", "acquire_input_focus")
end

function final(self)

end

function update(self, dt)

end

function on_message(self, message_id, message, sender)

end

function on_input(self, action_id, action)
	if action_id == hash("mouse_button_left") and action.released then
		local id = factory.create("#factory", vmath.vector3(action.x, action.y, 0))
		print(id)
	end
end

function on_reload(self)

end
]]

local logo_script = [[function init(self)
	go.animate(".", "euler.z", go.PLAYBACK_LOOP_FORWARD, 360, go.EASING_LINEAR, 2)
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
	name = "Factory",
	url = "#cp_factory",
	grid = true,
	scripts = {
		{
			url = "cp_factory:/go#go",
			name = "factory.script",
			code = factory_script
		},
		{
			id = "logo",
			name = "logo.script",
			code = logo_script
		},
	}
}