components {
  id: "go"
  component: "/codepad/go.script"
  properties {
    id: "script_id"
    value: "logo"
    type: PROPERTY_TYPE_HASH
  }
}
embedded_components {
  id: "sprite"
  type: "sprite"
  data: "default_animation: \"logo\"\n"
  "material: \"/builtins/materials/sprite.material\"\n"
  "textures {\n"
  "  sampler: \"texture_sampler\"\n"
  "  texture: \"/main/assets/logo.atlas\"\n"
  "}\n"
  ""
}
