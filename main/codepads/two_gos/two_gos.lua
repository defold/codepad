local go1_script = [[function init(self)
	go.animate(".", "position.y", go.PLAYBACK_LOOP_PINGPONG, 100, go.EASING_LINEAR, 2)
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

local go2_script = [[function init(self)
	go.animate(".", "position.y", go.PLAYBACK_LOOP_PINGPONG, 150, go.EASING_LINEAR, 2)
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
	name = "Two GOs",
	url = "#cp_two_gos",
	grid = true,
	scripts = {
		{
			url = "cp_two_gos:/go1#go",
			name = "go1.script",
			code = go1_script
		},
		{
			url = "cp_two_gos:/go2#go",
			name = "go2.script",
			--code = go2_script
		},
	}
}