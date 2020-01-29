return {
	name = "Factory",
	url = "#cp_factory",
	grid = true,
	scripts = {
		{
			url = "cp_factory:/go#go",
			name = "factory.script",
			code = sys.load_resource("/main/scripts/factory/factory.script")
		},
		{
			id = "logo",
			name = "logo.script",
			code = sys.load_resource("/main/scripts/factory/logo.script")
		},
	}
}