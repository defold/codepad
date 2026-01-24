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
    std::string g_FilterId;

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
        if (strcmp(key, "id") == 0 || strcmp(key, "type") == 0 || strcmp(key, "resource") == 0 || strcmp(key, "script_id") == 0)
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

    static const char* NormalizeType(const char* type_str, std::string& out)
    {
        if (!type_str)
        {
            return 0;
        }
        size_t len = strlen(type_str);
        if (len > 0 && type_str[len - 1] == 'c')
        {
            out.assign(type_str, len - 1);
            return out.c_str();
        }
        return type_str;
    }

    static bool IsCollectionProxyType(const char* type_str)
    {
        if (!type_str)
        {
            return false;
        }
        return strncmp(type_str, "collectionproxy", 15) == 0;
    }

    static bool MatchesFilter(const char* name_str, const char* filter)
    {
        if (!filter || filter[0] == '\0')
        {
            return true;
        }
        if (!name_str || name_str[0] == '\0')
        {
            return false;
        }
        if (strcmp(name_str, filter) == 0)
        {
            return true;
        }
        if (filter[0] == '#' && strcmp(name_str, filter + 1) == 0)
        {
            return true;
        }
        if (name_str[0] == '#' && strcmp(name_str + 1, filter) == 0)
        {
            return true;
        }
        return false;
    }

    static bool FindCollectionProxyById(dmGameObject::SceneNode* node, const char* filter, dmGameObject::SceneNode* out)
    {
        dmhash_t name_hash = 0;
        dmhash_t type_hash = 0;
        GetNodeInfo(node, name_hash, type_hash);

        const char* name_str = name_hash ? dmHashReverseSafe64(name_hash) : 0;
        const char* type_str = type_hash ? dmHashReverseSafe64(type_hash) : 0;

        if (IsCollectionProxyType(type_str) && MatchesFilter(name_str, filter))
        {
            *out = *node;
            return true;
        }

        dmGameObject::SceneNodeIterator it = dmGameObject::TraverseIterateChildren(node);
        while (dmGameObject::TraverseIterateNext(&it))
        {
            dmGameObject::SceneNode child = it.m_Node;
            if (FindCollectionProxyById(&child, filter, out))
            {
                return true;
            }
        }
        return false;
    }

    static bool FindFirstCollectionProxy(dmGameObject::SceneNode* node, dmGameObject::SceneNode* out)
    {
        dmhash_t name_hash = 0;
        dmhash_t type_hash = 0;
        GetNodeInfo(node, name_hash, type_hash);

        const char* type_str = type_hash ? dmHashReverseSafe64(type_hash) : 0;
        if (IsCollectionProxyType(type_str))
        {
            *out = *node;
            return true;
        }

        dmGameObject::SceneNodeIterator it = dmGameObject::TraverseIterateChildren(node);
        while (dmGameObject::TraverseIterateNext(&it))
        {
            dmGameObject::SceneNode child = it.m_Node;
            if (FindFirstCollectionProxy(&child, out))
            {
                return true;
            }
        }
        return false;
    }

    static void DumpNode(std::string& out, dmGameObject::SceneNode* node)
    {
        dmhash_t name_hash = 0;
        dmhash_t type_hash = 0;
        GetNodeInfo(node, name_hash, type_hash);

        const char* name_str = name_hash ? dmHashReverseSafe64(name_hash) : 0;
        if (!name_str || name_str[0] == '\0')
        {
            name_str = "node";
        }

        const char* raw_type_str = type_hash ? dmHashReverseSafe64(type_hash) : 0;
        std::string type_clean;
        const char* type_str = NormalizeType(raw_type_str, type_clean);

        out.push_back('{');
        bool first = true;
        AppendField(out, "type", type_str, &first);

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
        bool first_child = true;
        while (dmGameObject::TraverseIterateNext(&it))
        {
            if (!first_child)
            {
                out.push_back(',');
            }
            first_child = false;
            DumpNode(out, &it.m_Node);
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
        dmGameObject::SceneNode target = root;
        bool found_target = false;
        if (!g_FilterId.empty())
        {
            found_target = FindCollectionProxyById(&root, g_FilterId.c_str(), &target);
            if (!found_target)
            {
                found_target = FindFirstCollectionProxy(&root, &target);
            }
        }
        if (found_target)
        {
            dmhash_t type_hash = 0;
            dmhash_t name_hash = 0;
            GetNodeInfo(&target, name_hash, type_hash);
            const char* type_str = type_hash ? dmHashReverseSafe64(type_hash) : 0;
            if (IsCollectionProxyType(type_str))
            {
                g_Buffer.push_back('[');
                dmGameObject::SceneNodeIterator it = dmGameObject::TraverseIterateChildren(&target);
                bool first_child = true;
                while (dmGameObject::TraverseIterateNext(&it))
                {
                    if (!first_child)
                    {
                        g_Buffer.push_back(',');
                    }
                    first_child = false;
                    DumpNode(g_Buffer, &it.m_Node);
                }
                g_Buffer.push_back(']');
            }
            else
            {
                DumpNode(g_Buffer, &target);
            }
        }
        else
        {
            DumpNode(g_Buffer, &root);
        }
        return g_Buffer.c_str();
    }
}

#if defined(DM_PLATFORM_HTML5)
extern "C" EMSCRIPTEN_KEEPALIVE const char* CodepadSceneDump_DumpJson()
{
    return BuildSceneJson();
}
extern "C" EMSCRIPTEN_KEEPALIVE void CodepadSceneDump_SetFilter(const char* filter)
{
    g_FilterId = filter ? filter : "";
}
#else
extern "C" const char* CodepadSceneDump_DumpJson()
{
    return 0;
}
extern "C" void CodepadSceneDump_SetFilter(const char* filter)
{
    (void)filter;
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
