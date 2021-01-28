# adapted from https://github.com/plotly/plotly.py/blob/9af744b9273c1b83aa22912baa2b2fb0e2af1b79/plotly/utils.py#L116

import json
import pytz

try:
    import numpy
    _numpy_imported = True
except ImportError:
    _numpy_imported = False

try:
    import pandas
    _pandas_imported = True
except ImportError:
    _pandas_imported = False

try:
    import sage.all
    _sage_imported = True
except ImportError:
    _sage_imported = False

def iso_to_plotly_time_string(iso_string):
    """Remove timezone info and replace 'T' delimeter with ' ' (ws)."""
    # make sure we don't send timezone info to plotly
    if (iso_string.split('-')[:3] is '00:00') or\
            (iso_string.split('+')[0] is '00:00'):
        raise Exception("Plotly won't accept timestrings with timezone info.\n"
                        "All timestrings are assumed to be in UTC.")

    iso_string = iso_string.replace('-00:00', '').replace('+00:00', '')

    if iso_string.endswith('T00:00:00'):
        return iso_string.replace('T00:00:00', '')
    else:
        return iso_string.replace('T', ' ')

class NotEncodable(Exception):
    pass

class JSONEncoderNan(json.JSONEncoder):
    """
    Meant to be passed as the `cls` kwarg to json.dumps(obj, cls=..)
    See PlotlyJSONEncoder.default for more implementation information.
    Additionally, this encoder overrides nan functionality so that 'Inf',
    'NaN' and '-Inf' encode to 'null'. Which is stricter JSON than the Python
    version.
    """

    # we want stricter JSON, so convert NaN, Inf, -Inf --> 'null'
    nan_str = inf_str = neg_inf_str = 'null'

    # uses code from official python json.encoder module. Same licence applies.
    def iterencode(self, o, _one_shot=False):
        """
        Encode the given object and yield each string
        representation as available.
        For example::
            for chunk in JSONEncoder().iterencode(bigobject):
                mysocket.write(chunk)
        """
        if self.check_circular:
            markers = {}
        else:
            markers = None
        if self.ensure_ascii:
            _encoder = json.encoder.encode_basestring_ascii
        else:
            _encoder = json.encoder.encode_basestring
        if self.encoding != 'utf-8':
            def _encoder(o, _orig_encoder=_encoder, _encoding=self.encoding):
                if isinstance(o, str):
                    o = o.decode(_encoding)
                return _orig_encoder(o)

        def floatstr(o, allow_nan=self.allow_nan,
                     _repr=json.encoder.FLOAT_REPR, _inf=json.encoder.INFINITY,
                     _neginf=-json.encoder.INFINITY):
            # Check for specials.  Note that this type of test is processor
            # and/or platform-specific, so do tests which don't depend on the
            # internals.

            # *any* two NaNs are not equivalent (even to itself) try:
            # float('NaN') == float('NaN')
            if o != o:
                text = self.nan_str
            elif o == _inf:
                text = self.inf_str
            elif o == _neginf:
                text = self.neg_inf_str
            else:
                return _repr(o)

            if not allow_nan:
                raise ValueError(
                    "Out of range float values are not JSON compliant: " +
                    repr(o))

            return text

        _iterencode = json.encoder._make_iterencode(
                markers, self.default, _encoder, self.indent, floatstr,
                self.key_separator, self.item_separator, self.sort_keys,
                self.skipkeys, _one_shot)
        return _iterencode(o, 0)

    def default(self, obj):
        """
        Accept an object (of unknown type) and try to encode with priority:
        1. builtin:     user-defined objects
        2. sage:        sage math cloud
        3. pandas:      dataframes/series
        4. numpy:       ndarrays
        5. datetime:    time/datetime objects
        Each method throws a NotEncoded exception if it fails.
        The default method will only get hit if the object is not a type that
        is naturally encoded by json:
            Normal objects:
                dict                object
                list, tuple         array
                str, unicode        string
                int, long, float    number
                True                true
                False               false
                None                null
            Extended objects:
                float('nan')        'NaN'
                float('infinity')   'Infinity'
                float('-infinity')  '-Infinity'
        Therefore, we only anticipate either unknown iterables or values here.
        """
        # TODO: The ordering if these methods is *very* important. Is this OK?
        encoding_methods = (
            self.encode_as_plotly,
            self.encode_as_sage,
            self.encode_as_numpy,
            self.encode_as_pandas,
            self.encode_as_datetime,
            self.encode_as_date,
            self.encode_as_list  # because some values have `tolist` do last.
        )
        for encoding_method in encoding_methods:
            try:
                return encoding_method(obj)
            except NotEncodable:
                pass
        return json.JSONEncoder.default(self, obj)

    @staticmethod
    def encode_as_plotly(obj):
        """Attempt to use a builtin `to_plotly_json` method."""
        try:
            return obj.to_plotly_json()
        except AttributeError:
            raise NotEncodable

    @staticmethod
    def encode_as_list(obj):
        """Attempt to use `tolist` method to convert to normal Python list."""
        if hasattr(obj, 'tolist'):
            return obj.tolist()
        else:
            raise NotEncodable

    @staticmethod
    def encode_as_sage(obj):
        """Attempt to convert sage.all.RR to floats and sage.all.ZZ to ints"""
        if not _sage_imported:
            raise NotEncodable

        if obj in sage.all.RR:
            return float(obj)
        elif obj in sage.all.ZZ:
            return int(obj)
        else:
            raise NotEncodable

    @staticmethod
    def encode_as_pandas(obj):
        """Attempt to convert pandas.NaT"""
        if not _pandas_imported:
            raise NotEncodable

        if obj is pandas.NaT:
            return None
        else:
            raise NotEncodable

    @staticmethod
    def encode_as_numpy(obj):
        """Attempt to convert numpy.ma.core.masked"""
        if not _numpy_imported:
            raise NotEncodable

        if obj is numpy.ma.core.masked:
            return float('nan')
        else:
            raise NotEncodable

    @staticmethod
    def encode_as_datetime(obj):
        """Attempt to convert to utc-iso time string using datetime methods."""

        # first we need to get this into utc
        try:
            obj = obj.astimezone(pytz.utc)
        except ValueError:
            # we'll get a value error if trying to convert with naive datetime
            pass
        except TypeError:
            # pandas throws a typeerror here instead of a value error, it's OK
            pass
        except AttributeError:
            # we'll get an attribute error if astimezone DNE
            raise NotEncodable

        # now we need to get a nicely formatted time string
        try:
            time_string = obj.isoformat()
        except AttributeError:
            raise NotEncodable
        else:
            return iso_to_plotly_time_string(time_string)

    @staticmethod
    def encode_as_date(obj):
        """Attempt to convert to utc-iso time string using date methods."""
        try:
            time_string = obj.isoformat()
        except AttributeError:
            raise NotEncodable
        else:
            return iso_to_plotly_time_string(time_string)

