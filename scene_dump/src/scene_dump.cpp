#define EXTENSION_NAME codepad_scene_dump
#define LIB_NAME "codepad_scene_dump"
#define MODULE_NAME "codepad_scene_dump"
#ifndef DLIB_LOG_DOMAIN
#define DLIB_LOG_DOMAIN LIB_NAME
#endif
#include <dmsdk/sdk.h>

#include <dmsdk/dlib/hash.h>
#include <dmsdk/gameobject/gameobject.h>

#if defined(DM_PLATFORM_HTML5)
#include <emscripten/emscripten.h>
#endif

#include <stdio.h>
#include <string.h>
#include <string>

namespace
{
    struct SceneDumpContext
    {
        dmGameObject::HRegister m_Register;
        bool m_Initialized;
    };

    SceneDumpContext g_Context = { 0, false };
    std::string g_Buffer;

    static void AppendJsonString(std::string& out, const char* value)
    {
        out.push_back('"');
        if (value)
        {
            const unsigned char* p = (const unsigned char*)value;
            while (*p)
            {
                unsigned char c = *p++;
                switch (c)
                {
                    case '"': out.append("\\\""); break;
                    case '\\': out.append("\\\\"); break;
                    case '\b': out.append("\\b"); break;
                    case '\f': out.append("\\f"); break;
                    case '\n': out.append("\\n"); break;
                    case '\r': out.append("\\r"); break;
                    case '\t': out.append("\\t"); break;
                    default:
                        if (c < 0x20)
                        {
                            char buf[7];
                            snprintf(buf, sizeof(buf), "\\u%04x", (unsigned int)c);
                            out.append(buf);
                        }
                        else
                        {
                            out.push_back((char)c);
                        }
                        break;
                }
            }
        }
        out.push_back('"');
    }

    static void AppendJsonNumber(std::string& out, double value)
    {
        char buffer[64];
        snprintf(buffer, sizeof(buffer), "%.6g", value);
        out.append(buffer);
    }

    static void AppendJsonBool(std::string& out, bool value)
    {
        out.append(value ? "true" : "false");
    }

    static void AppendField(std::string& out, const char* key, const char* value, bool* first)
    {
        if (!*first)
        {
            out.push_back(',');
        }
        *first = false;
        AppendJsonString(out, key);
        out.push_back(':');
        if (value)
        {
            AppendJsonString(out, value);
        }
        else
        {
            out.append("null");
        }
    }

    static void AppendJsonVector(std::string& out, const float* value, int count)
    {
        out.push_back('[');
        for (int i = 0; i < count; ++i)
        {
            if (i > 0)
            {
                out.push_back(',');
            }
            AppendJsonNumber(out, value[i]);
        }
        out.push_back(']');
    }

    static void AppendPropertyValue(std::string& out, dmGameObject::SceneNodeProperty* property)
    {
        switch (property->m_Type)
        {
            case dmGameObject::SCENE_NODE_PROPERTY_TYPE_HASH:
            {
                const char* value = dmHashReverseSafe64(property->m_Value.m_Hash);
                if (value)
                {
                    AppendJsonString(out, value);
                }
                else
                {
                    out.append("null");
                }
                break;
            }
            case dmGameObject::SCENE_NODE_PROPERTY_TYPE_NUMBER:
                AppendJsonNumber(out, property->m_Value.m_Number);
                break;
            case dmGameObject::SCENE_NODE_PROPERTY_TYPE_BOOLEAN:
                AppendJsonBool(out, property->m_Value.m_Bool);
                break;
            case dmGameObject::SCENE_NODE_PROPERTY_TYPE_URL:
                AppendJsonString(out, property->m_Value.m_URL);
                break;
            case dmGameObject::SCENE_NODE_PROPERTY_TYPE_TEXT:
                AppendJsonString(out, property->m_Value.m_Text);
                break;
            case dmGameObject::SCENE_NODE_PROPERTY_TYPE_VECTOR3:
                AppendJsonVector(out, property->m_Value.m_V4, 3);
                break;
            case dmGameObject::SCENE_NODE_PROPERTY_TYPE_VECTOR4:
            case dmGameObject::SCENE_NODE_PROPERTY_TYPE_QUAT:
                AppendJsonVector(out, property->m_Value.m_V4, 4);
                break;
            default:
                out.append("null");
                break;
        }
    }

    static void AppendProperty(std::string& out, dmGameObject::SceneNodeProperty* property, bool* first)
    {
        const char* key = dmHashReverseSafe64(property->m_NameHash);
        if (!key || key[0] == '\0')
        {
            return;
        }
        if (strcmp(key, "id") == 0 || strcmp(key, "type") == 0)
        {
            return;
        }
        if (!*first)
        {
            out.push_back(',');
        }
        *first = false;
        AppendJsonString(out, key);
        out.push_back(':');
        AppendPropertyValue(out, property);
    }

    static void GetNodeInfo(dmGameObject::SceneNode* node, dmhash_t& name, dmhash_t& type)
    {
        static dmhash_t hash_id = dmHashString64("id");
        static dmhash_t hash_type = dmHashString64("type");

        dmGameObject::SceneNodePropertyIterator pit = TraverseIterateProperties(node);
        while (dmGameObject::TraverseIteratePropertiesNext(&pit))
        {
            if (pit.m_Property.m_NameHash == hash_id)
            {
                name = pit.m_Property.m_Value.m_Hash;
            }
            else if (pit.m_Property.m_NameHash == hash_type)
            {
                type = pit.m_Property.m_Value.m_Hash;
            }
        }
    }

    static void DumpNode(std::string& out, dmGameObject::SceneNode* node, const std::string& parent_path, int index)
    {
        dmhash_t name_hash = 0;
        dmhash_t type_hash = 0;
        GetNodeInfo(node, name_hash, type_hash);

        const char* name_str = name_hash ? dmHashReverseSafe64(name_hash) : 0;
        if (!name_str || name_str[0] == '\0')
        {
            name_str = "node";
        }

        const char* type_str = type_hash ? dmHashReverseSafe64(type_hash) : 0;

        std::string path;
        if (!parent_path.empty())
        {
            path.reserve(parent_path.size() + 32);
            path.append(parent_path);
            path.push_back('/');
        }
        else
        {
            path.reserve(32);
            path.push_back('/');
        }
        path.append(name_str);
        if (index >= 0)
        {
            char index_buf[16];
            snprintf(index_buf, sizeof(index_buf), "[%d]", index);
            path.append(index_buf);
        }

        out.push_back('{');
        bool first = true;
        AppendField(out, "name", name_str, &first);
        AppendField(out, "type", type_str, &first);
        AppendField(out, "path", path.c_str(), &first);

        out.append(",\"props\":{");
        bool props_first = true;
        AppendField(out, "id", name_str, &props_first);
        if (type_str)
        {
            AppendField(out, "type", type_str, &props_first);
        }
        dmGameObject::SceneNodePropertyIterator pit = TraverseIterateProperties(node);
        while (dmGameObject::TraverseIteratePropertiesNext(&pit))
        {
            AppendProperty(out, &pit.m_Property, &props_first);
        }
        out.push_back('}');

        out.append(",\"children\":[");
        dmGameObject::SceneNodeIterator it = dmGameObject::TraverseIterateChildren(node);
        int child_index = 0;
        bool first_child = true;
        while (dmGameObject::TraverseIterateNext(&it))
        {
            if (!first_child)
            {
                out.push_back(',');
            }
            first_child = false;
            DumpNode(out, &it.m_Node, path, child_index);
            ++child_index;
        }
        out.push_back(']');
        out.push_back('}');
    }

    static const char* BuildSceneJson()
    {
        g_Buffer.clear();
        if (!g_Context.m_Initialized)
        {
            g_Buffer.assign("null");
            return g_Buffer.c_str();
        }

        dmGameObject::SceneNode root;
        if (!dmGameObject::TraverseGetRoot(g_Context.m_Register, &root))
        {
            g_Buffer.assign("null");
            return g_Buffer.c_str();
        }

        g_Buffer.reserve(4096);
        DumpNode(g_Buffer, &root, std::string(), 0);
        return g_Buffer.c_str();
    }
}

#if defined(DM_PLATFORM_HTML5)
extern "C" EMSCRIPTEN_KEEPALIVE const char* CodepadSceneDump_DumpJson()
{
    return BuildSceneJson();
}
#else
extern "C" const char* CodepadSceneDump_DumpJson()
{
    return 0;
}
#endif

static dmExtension::Result AppInitializeSceneDump(dmExtension::AppParams* params)
{
    g_Context.m_Register = dmEngine::GetGameObjectRegister(params);
    g_Context.m_Initialized = true;
    return dmExtension::RESULT_OK;
}

static dmExtension::Result InitializeSceneDump(dmExtension::Params* params)
{
    return dmExtension::RESULT_OK;
}

static dmExtension::Result AppFinalizeSceneDump(dmExtension::AppParams* params)
{
    return dmExtension::RESULT_OK;
}

static dmExtension::Result FinalizeSceneDump(dmExtension::Params* params)
{
    return dmExtension::RESULT_OK;
}

DM_DECLARE_EXTENSION(EXTENSION_NAME, LIB_NAME, AppInitializeSceneDump, AppFinalizeSceneDump, InitializeSceneDump, 0, 0, FinalizeSceneDump)
