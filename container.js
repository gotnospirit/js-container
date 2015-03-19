(function(w) {

var ParameterPattern = /%([a-zA-Z_-]+)%/g,
    ContainerReferenceKeyword = 'container';

function evaluate(parameter, index, collection)
{
    var key = null,
        result = null;

    if (parameter.isReference())
    {
        key = parameter.key();
        result = ContainerReferenceKeyword === key
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
};

function Parameter(value, is_required)
{
    this.value_ = value;
    this.is_required_ = undefined !== is_required ? !!is_required : true;
}

Parameter.prototype.optional = function()
{
    return !this.is_required_;
};

Parameter.prototype.isReference = function()
{
    var value = this.value_;

    return this.isString() && value && '@' === value[0];
};

Parameter.prototype.isString = function()
{
    return 'string' === typeof(this.value_);
};

Parameter.prototype.key = function()
{
    var value = this.value_;

    return (this.isString() && value)
        ? value.substr(1)
        : null;
};

Parameter.prototype.value = function(hash)
{
    var replacements = null,
        key = null,
        result = this.value_;

    if (this.isString())
    {
        replacements = this.match(hash);

        if (replacements)
        {
            for (key in replacements)
            {
                result = result.replace(new RegExp('%' + key + '%', 'g'), replacements[key]);
            }
        }
    }
    return result;
};

Parameter.prototype.match = function(hash)
{
    var result = null,
        content = this.value_,
        match = null,
        key = null,
        value = null;

    while (match = ParameterPattern.exec(content))
    {
        key = match[1];
        value = hash[key];

        if (undefined !== value)
        {
            if (!result)
            {
                result = {};
            }

            result[key] = value;
        }
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
    else if (ContainerReferenceKeyword === id)
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
        calls: []
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
            var args = Array.prototype.slice.call(arguments, 1),
                i = 0,
                max = args.length,
                argument = null;

            if ('function' !== typeof(fn))
            {
                throw new Error('The 1st argument must be a valid callable');
            }

            argument = [fn];

            for (; i < max; ++i)
            {
                argument.push(new Parameter(args[i], true));
            }
            definition.calls.push(argument);
            return this;
        }
    };
};

Container.prototype.set = function(key, value)
{
    this.parameters[key] = value;
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

        if (!result)
        {
            instance = Object.create(definition.callable.prototype);

            result = definition.callable.apply(instance, definition.args.map(evaluate, this));

            if (!result)
            {
                result = instance;
            }

            for (max = definition.calls.length; i < max; ++i)
            {
                definition.calls[i][0].apply(result, definition.calls[i].slice(1).map(evaluate, this));
            }

            if (definition.singleton)
            {
                this.instances[id] = result;
            }
        }
    }
    return result;
};

w.Container = Container;

})(this);