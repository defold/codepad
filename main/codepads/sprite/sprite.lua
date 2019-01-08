local go_script = [[function init(self)
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

return {
	name = "GO + Sprite",
	url = "#cp_sprite",
	grid = true,
	scripts = {
		{
			url = "cp_sprite:/go#go",
			name = "go.script",
			code = go_script
		}
	}
}