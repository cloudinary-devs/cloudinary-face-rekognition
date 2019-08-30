/*
Copyright (c) 2019 Cloudinary

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), 
to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, 
and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS 
IN THE SOFTWARE.
*/

const cloudinary = require('cloudinary').v2

/* 
    This function retrieves all resources starting with the prefix.
    If prefix is null, it will retrieve assets from root (/)
*/
exports.retrieveResources = async (prefix, type, resource_type) => {
    const options = {
        type: type,
        resource_type: resource_type,
        prefix: prefix,
        tags: true,
        max_results: 500
    }
    let output = new Array()
    let response = null
    do {
        response = await cloudinary.api.resources(options)
        output = output.concat(response.resources)
        options.next_cursor = response.next_cursor
    } while (response.next_cursor)
    return output
}

/* 
    This function adds the passed tags to the image represented by the public_id. 
*/
exports.addTags = (tags, public_id) => {
    return cloudinary.api.resource(public_id, {
            type: 'upload'
        })
        .then(response => {
            const newTags = response.tags ? tags.concat(response.tags) : tags
            return cloudinary.uploader.explicit(public_id, {
                type: 'upload',
                tags: newTags
            })
        }).catch(error => {
            console.log(error)
        })
}

/* 
    This function uploads image represented by the url to Cloudinary under the folder passed with supplied tags
*/
exports.upload = (url, folder, tags) => {
    return cloudinary.uploader.upload(url, {
        resource_type: 'image',
        type: 'upload',
        folder: folder,
        tags: tags
    })
}