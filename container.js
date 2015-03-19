(function(w) {

var ParameterPattern = /%([a-zA-Z_-]+)%/g,
    ContainerReferenceKeyword = 'container';

function evaluate(parameter, index, collection)
{
    var key = null,
        result = null;

    if (parameter.reference())
    {
        key = parameter.key();
        result = key === ContainerReferenceKeyword
            ? this
            : this.get(key);

        if (!result)
        {
            if (!parameter.optional())
            {
                throw new Error('<' + key + '> not found.');
            }
            result = null;
        }
        return result;
    }
    return parameter.value(this.parameters);
}

function substitute(content, hash)
{
    var match = null,
        key = null,
        value = null,
        placeholders = [],
        i = 0,
        max = 0;

    while (match = ParameterPattern.exec(content))
    {
        key = match[1];
        value = hash[key];

        if (undefined !== value)
        {
            // Si le paramètre ne constitue qu'une unique substitution
            if (match[0] === content)
            {
                ParameterPattern.lastIndex = 0;
                // on renvoit directement la valeur associée
                // -> on peut ainsi transférer autre chose que des strings
                return value;
            }
            else
            {
                // sinon, on collecte la valeur associée pour un remplacement ultérieur
                placeholders.push(key, value);
            }
        }
    }

    // On remplace les valeurs collectées
    for (max = placeholders.length; i < max; i += 2)
    {
        content = content.replace(new RegExp('%' + placeholders[i] + '%', 'g'), placeholders[i + 1]);
    }
    return content;
}

function Configurator(callable, key)
{
    if (!key)
    {
        key = null;

        if ('function' !== typeof(callable))
        {
            throw new Error('Invalid callable <' + callable + '>');
        }
    }
    else
    {
        if ('string' !== typeof(key) || '@' !== key[0])
        {
            throw new Error('Invalid reference <' + key + '>');
        }

        key = key.substr(1);
        if (!key || key === ContainerReferenceKeyword)
        {
            throw new Error('Invalid reference <' + key + '>');
        }

        if ('function' !== typeof(callable) && 'string' !== typeof(callable))
        {
            throw new Error('Invalid callable <' + callable + '>');
        }
    }

    this.callable_ = callable;
    this.reference_ = key;
}

Configurator.prototype.execute = function(container, instance)
{
    var key = this.reference_,
        fn = this.callable_,
        o = null,
        type = typeof(fn);

    if (null === key)
    {
        fn(instance);
    }
    else
    {
        o = container.get(key);

        if (!o)
        {
            throw new Error('<' + key + '> not found.');
        }

        if ('string' === type && undefined !== o[fn])
        {
            o[fn](instance);
        }
        else if ('function' === type)
        {
            fn.call(o, instance);
        }
        else
        {
            throw new Error('Invalid callable <' + fn + '>');
        }
    }
};

function Parameter(value, is_required)
{
    this.value_ = value;
    this.is_required_ = undefined !== is_required
        ? !!is_required
        : true;
}

Parameter.prototype.optional = function()
{
    return !this.is_required_;
};

Parameter.prototype.reference = function()
{
    var value = this.value_;

    return 'string' === typeof(value) && value && '@' === value[0];
};

Parameter.prototype.key = function()
{
    var value = this.value_;

    return this.reference()
        ? value.substr(1)
        : value;
};

Parameter.prototype.value = function(hash)
{
    var result = this.value_;

    if ('string' === typeof(result) && result)
    {
        return substitute(result, hash);
    }
    return result;
};

function Container()
{
    this.definitions = {};
    this.parameters = {};
    this.instances = {};
}

Container.prototype.clear = function()
{
    this.definitions = {};
    this.parameters = {};
    this.instances = {};
};

Container.prototype.destroy = function(id)
{
    if (undefined === this.instances[id])
    {
        return false;
    }

    delete this.instances[id];
    return true;
};

Container.prototype.register = function(id, callable, singleton)
{
    if (!id || 'string' !== typeof(id))
    {
        throw new Error('The 1st argument must be a non-empty string');
    }
    else if ('function' !== typeof(callable))
    {
        throw new Error('The 2nd argument must be a valid callable');
    }
    else if (id === ContainerReferenceKeyword)
    {
        throw new Error('<' + ContainerReferenceKeyword + '> is a reserved keyword');
    }
    else if (undefined !== this.definitions[id])
    {
        console.warn('<' + id + '> is already registered');
    }

    var definition = {
        callable: callable,
        singleton: undefined !== singleton ? !!singleton : true,
        args: [],
        calls: [],
        configs: []
    };

    this.definitions[id] = definition;

    return {
        argument: function(value, is_required)
        {
            definition.args.push(new Parameter(value, is_required));
            return this;
        },

        method: function(fn)
        {
            var i = 1,
                max = arguments.length,
                args = null;

            if ('function' !== typeof(fn))
            {
                throw new Error('The 1st argument must be a valid callable');
            }

            args = [fn];

            for (; i < max; ++i)
            {
                args.push(new Parameter(arguments[i], true));
            }
            definition.calls.push(args);
            return this;
        },

        /**
         * configure('@reference', 'setupInstance')
         *
         * configure('@reference', Service.prototype.setupInstance)
         *
         * configure(function(instance) {
         *  instance.setup();
         * });
         */
        configure: function(fn)
        {
            switch (arguments.length)
            {
                case 1:
                    definition.configs.push(new Configurator(arguments[0]));
                    break;
                case 2:
                    definition.configs.push(new Configurator(arguments[1], arguments[0]));
                    break;
                default:
                    throw new Error('Invalid configurator');
                    break;
            }
            return this;
        }
    };
};

Container.prototype.set = function(key, value)
{
    this.parameters[key] = ('object' === typeof(value) && null !== value)
        ? Object.create(value)
        : value;
    return this;
};

Container.prototype.get = function(id)
{
    var result = null,
        instance = null,
        definition = this.definitions[id],
        i = 0,
        max = 0;

    if (definition)
    {
        if (definition.singleton)
        {
            result = this.instances[id] || null;
        }

        // Si aucune instance n'a été conservée
        if (!result)
        {
            // On en crée une nouvelle
            instance = Object.create(definition.callable.prototype);
            // On appelle le constructeur
            result = definition.callable.apply(instance, definition.args.map(evaluate, this));
            // S'il n'a pas retourné un nouvel objet
            if (!result)
            {
                // alors il s'agit toujours de la même instance
                result = instance;
            }

            // On appelle les fonctions de configuration
            for (i = 0, max = definition.configs.length; i < max; ++i)
            {
                definition.configs[i].execute(this, result);
            }

            // On appelle les fonctions post-configuration
            for (i = 0, max = definition.calls.length; i < max; ++i)
            {
                definition.calls[i][0].apply(result, definition.calls[i].slice(1).map(evaluate, this));
            }

            // Et s'il s'agit d'un singleton
            if (definition.singleton)
            {
                // On le stocke pour plus tard
                this.instances[id] = result;
            }
        }
    }
    return result;
};

w.Container = Container;

})(this);