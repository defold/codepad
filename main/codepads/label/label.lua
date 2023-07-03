local go_script = [[function init(self)
	label.set_text("#label", "Hello World!")
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
	name = "GO + Label",
	url = "#cp_label",
	grid = true,
	scripts = {
		{
			url = "cp_label:/go#go",
			name = "go.script",
			code = go_script
		}
	}
}